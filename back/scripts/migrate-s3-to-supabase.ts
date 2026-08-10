import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

interface AttachmentRow {
  id: number;
  s3_bucket: string;
  s3_key: string;
  mime_type: string | null;
}

const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
const sourcePath = path.resolve(
  sourceArg?.slice("--source=".length) ||
    path.join(__dirname, "..", "sqlite", "work-tracking.sqlite3"),
);
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : null;
const dryRun = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  if (!existsSync(sourcePath)) {
    throw new Error(`SQLite source file not found: ${sourcePath}`);
  }
  const source = new DatabaseSync(sourcePath);
  const allRows = source
    .prepare(
      `SELECT id, s3_bucket, s3_key, mime_type
         FROM line_works_attachments
        ORDER BY id ASC`,
    )
    .all() as unknown as AttachmentRow[];
  source.close();

  const rows = limit && limit > 0 ? allRows.slice(0, limit) : allRows;
  console.log(`[plan] ${rows.length}/${allRows.length} objects`);
  if (dryRun) return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseSecret) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  }

  const destinationBucket =
    process.env.SUPABASE_STORAGE_BUCKET || "work-tracking-private";
  const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-northeast-2" });
  const supabase = createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let uploaded = 0;
  let skipped = 0;
  for (const row of rows) {
    const object = await s3.send(
      new GetObjectCommand({ Bucket: row.s3_bucket, Key: row.s3_key }),
    );
    if (!object.Body) {
      throw new Error(`S3 object has no body: ${row.s3_bucket}/${row.s3_key}`);
    }
    const bytes = await object.Body.transformToByteArray();
    const { error } = await supabase.storage
      .from(destinationBucket)
      .upload(row.s3_key, bytes, {
        contentType: row.mime_type || object.ContentType || undefined,
        upsert: false,
      });

    if (error) {
      const duplicate =
        String((error as { statusCode?: string }).statusCode) === "409" ||
        /duplicate|already exists/i.test(error.message);
      if (!duplicate) {
        throw new Error(`Upload failed (${row.s3_key}): ${error.message}`);
      }
      skipped += 1;
    } else {
      uploaded += 1;
    }
    console.log(`[${uploaded + skipped}/${rows.length}] ${row.s3_key}`);
  }

  console.log(`S3 → Supabase Storage complete: uploaded=${uploaded}, skipped=${skipped}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
