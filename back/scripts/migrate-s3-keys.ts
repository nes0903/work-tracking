/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 기존 S3 첨부 파일을 새 key 규칙으로 이사시키는 일회성 스크립트.
 *
 * 변경 규칙:
 *   OLD: <prefix>line-works/<channelId>/<YYYY-MM-DD>/<fileId>-<fileName>
 *   NEW: <prefix>line-works/<channelId>/<YYYY-MM-DD>/<fileName>
 *
 * 충돌(같은 날짜·같은 파일명)은 "name(1).ext", "name(2).ext" 로 회피.
 *
 * 실행:
 *   cd back
 *   npx ts-node scripts/migrate-s3-keys.ts [--dry-run] [--limit=N]
 *
 *   --dry-run   실제 복사/삭제/DB 변경 없이 출력만
 *   --limit=N   앞에서 N 건까지만 처리 (점진 이행/테스트용)
 */

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";
import path from "node:path";

// .env 수동 로드 (dotenv 미설치 환경 대응)
(function loadDotEnv() {
  const file = path.resolve(__dirname, "..", ".env");
  try {
    const text = readFileSync(file, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Z0-9_]+$/.test(key)) continue;
      if (key in process.env) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // .env 없어도 OS env 만으로 동작할 수 있으므로 경고만
    console.warn(`[migrate] .env not found at ${file} (continuing)`);
  }
})();

// 실제 라이브러리는 동적 로드 (dotenv 로드 후에 import 되어야 S3_BUCKET_LINE_WORKS 등을 본다)
const { getDatabase } = require("../src/libs/sqlite-db") as typeof import("../src/libs/sqlite-db");
const s3lib = require("../src/libs/s3") as typeof import("../src/libs/s3");
const botDb = require("../src/libs/line-works-bot-db") as typeof import("../src/libs/line-works-bot-db");

interface Row {
  id: number;
  file_id: string;
  file_name: string | null;
  s3_bucket: string;
  s3_key: string;
  uploaded_at: string | null;
  message_channel_id: string | null;
  message_issued_at: string | null;
  channel_title: string | null;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
  return { dryRun, limit };
}

async function main() {
  const { dryRun, limit } = parseArgs();

  const s3Config = s3lib.loadS3Config();
  if (!s3Config) {
    console.error("S3 not configured (S3_BUCKET_LINE_WORKS 확인)");
    process.exit(1);
  }

  const db = getDatabase();
  const s3 = new S3Client({ region: s3Config.region });

  const rows = db
    .prepare(
      `
        SELECT a.id,
               a.file_id,
               a.file_name,
               a.s3_bucket,
               a.s3_key,
               a.uploaded_at,
               m.channel_id AS message_channel_id,
               m.issued_at  AS message_issued_at,
               c.title       AS channel_title
          FROM line_works_attachments a
     LEFT JOIN line_works_messages m ON m.message_id = a.message_id
     LEFT JOIN line_works_channels c ON c.channel_id = m.channel_id
      ORDER BY a.id ASC
      `,
    )
    .all() as unknown as Row[];

  console.log(`대상 레코드: ${rows.length}건 (dryRun=${dryRun}, limit=${limit})`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for (const row of rows) {
    if (processed >= limit) break;
    processed++;

    const oldKey = row.s3_key;
    const channelId = row.message_channel_id;
    if (!channelId) {
      skipped++;
      continue;
    }

    // 새 포맷의 base key 를 매번 계산한 뒤, oldKey 와 다르면 이사.
    // ─ sanitize 규칙이 바뀐 경우(한글 보존 등)에도 자동으로 재이사.
    const lastSlash = oldKey.lastIndexOf("/");
    const lastSegmentFallback = oldKey.slice(lastSlash + 1);
    const fileName = row.file_name ?? lastSegmentFallback;
    const baseKey = s3lib.buildAttachmentObjectKey({
      prefix: s3Config.prefix,
      channelId,
      channelName: row.channel_title,
      issuedAt: row.message_issued_at ?? row.uploaded_at,
      fileName,
    });
    // 자기 자신(oldKey) 은 "존재"로 치지 말고, DB 상 다른 레코드가 쓰는 new key 만 충돌 처리
    const newKey = s3lib.resolveUniqueAttachmentKey(baseKey, (candidate) => {
      if (candidate === oldKey) return false;
      return botDb.attachmentS3KeyExists(row.s3_bucket, candidate);
    });

    if (newKey === oldKey) {
      skipped++;
      continue;
    }

    const label = `[${processed}/${rows.length}] #${row.id}`;
    console.log(`${label} ${oldKey}\n        → ${newKey}`);

    if (dryRun) {
      migrated++;
      continue;
    }

    try {
      await s3.send(
        new CopyObjectCommand({
          Bucket: row.s3_bucket,
          // CopySource 는 반드시 URL-encoded
          CopySource: `/${row.s3_bucket}/${encodeURI(oldKey)}`,
          Key: newKey,
          MetadataDirective: "COPY",
        }),
      );

      db.prepare(
        `UPDATE line_works_attachments SET s3_key = ? WHERE id = ?`,
      ).run(newKey, row.id);

      await s3.send(
        new DeleteObjectCommand({
          Bucket: row.s3_bucket,
          Key: oldKey,
        }),
      );

      migrated++;
    } catch (err) {
      failed++;
      console.error(`${label} FAILED:`, err);
    }
  }

  console.log(
    `\n완료 — migrated=${migrated}, skipped=${skipped}, failed=${failed}, dryRun=${dryRun}`,
  );
}

void main().catch((err) => {
  console.error("migration crashed:", err);
  process.exit(1);
});
