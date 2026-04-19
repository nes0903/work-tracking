import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

declare global {
  var __workTrackingDb__: DatabaseSync | undefined;
  var __workTrackingDbInitialized__: boolean | undefined;
}

const DB_PATH = path.join(
  __dirname,
  "..",
  "..",
  "sqlite",
  "work-tracking.sqlite3",
);
const SCHEMA_PATH = path.join(__dirname, "..", "..", "sqlite", "schema.sql");

export function getDatabase() {
  if (!globalThis.__workTrackingDb__) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    globalThis.__workTrackingDb__ = new DatabaseSync(DB_PATH);
    globalThis.__workTrackingDb__.exec("PRAGMA foreign_keys = ON;");
  }

  if (!globalThis.__workTrackingDbInitialized__) {
    globalThis.__workTrackingDb__.exec(readFileSync(SCHEMA_PATH, "utf8"));
    runColumnMigrations(globalThis.__workTrackingDb__);
    globalThis.__workTrackingDbInitialized__ = true;
  }

  return globalThis.__workTrackingDb__;
}

function tableHasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function runColumnMigrations(db: DatabaseSync): void {
  // tasks: created_by_user_id, assignee_user_id (태스크 할당자/담당자)
  if (!tableHasColumn(db, "tasks", "created_by_user_id")) {
    db.exec(`ALTER TABLE tasks ADD COLUMN created_by_user_id TEXT`);
  }
  if (!tableHasColumn(db, "tasks", "assignee_user_id")) {
    db.exec(`ALTER TABLE tasks ADD COLUMN assignee_user_id TEXT`);
  }
  // tasks: due_time (마감 시각, HH:MM)
  if (!tableHasColumn(db, "tasks", "due_time")) {
    db.exec(`ALTER TABLE tasks ADD COLUMN due_time TEXT`);
  }

  seedSiteLinksIfEmpty(db);
}

function seedSiteLinksIfEmpty(db: DatabaseSync): void {
  const count = (db
    .prepare(`SELECT COUNT(*) AS c FROM site_links`)
    .get() as { c: number } | undefined)?.c ?? 0;
  if (count > 0) return;

  const seeds: Array<{ label: string; url: string }> = [
    { label: "보고팡 운영", url: "https://dobedub.vogopang.com/library-hub" },
    { label: "보고팡 개발", url: "https://dev.vogopang.com/login?reason=auth_required&redirect=%2F" },
    { label: "보고팡 브로셔", url: "https://senior.dobedub.org/home" },
    { label: "푸딩툰 이용자", url: "https://www.puddingtoon.com/home" },
    { label: "푸딩툰 이용자 개발", url: "https://test.puddingtoon.org/home" },
    { label: "푸딩툰 관리자", url: "https://admin2.puddingtoon.org" },
    { label: "푸딩툰 관리자 개발", url: "https://dev-admin.puddingtoon.org/login" },
    { label: "픽미툰 이용자", url: "https://www.pickmetoon.com" },
    { label: "픽미툰 이용자 개발", url: "https://dev.pickmetoon.com" },
    { label: "픽미툰 관리자", url: "https://admin.pickmetoon.com" },
    { label: "픽미툰 관리자 개발", url: "https://admindev.pickmetoon.com" },
    { label: "덥라이트 운영", url: "https://staging.dubright.org" },
    { label: "덥라이트 개발", url: "https://test2.dubright.org" },
  ];

  const stmt = db.prepare(
    `INSERT INTO site_links (label, url, sort_order) VALUES (?, ?, ?)`,
  );
  for (let i = 0; i < seeds.length; i++) {
    stmt.run(seeds[i].label, seeds[i].url, i);
  }
}

export function withTransaction<T>(callback: (db: DatabaseSync) => T): T {
  const db = getDatabase();
  db.exec("BEGIN");

  try {
    const result = callback(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getJsonSetting<T>(key: string): T | null {
  const db = getDatabase();
  const row = db
    .prepare("SELECT value_json FROM app_settings WHERE key = ?")
    .get(key) as { value_json: string } | undefined;

  if (!row) {
    return null;
  }

  return JSON.parse(row.value_json) as T;
}

export function setJsonSetting(key: string, value: unknown) {
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `,
  ).run(key, JSON.stringify(value));
}

export { DB_PATH };
