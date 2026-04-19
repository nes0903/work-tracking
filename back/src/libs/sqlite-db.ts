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
