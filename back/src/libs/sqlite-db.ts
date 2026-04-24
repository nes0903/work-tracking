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

function tableHasColumn(
  db: DatabaseSync,
  table: string,
  column: string,
): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
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
  if (!tableHasColumn(db, "tasks", "parent_task_id")) {
    db.exec(`ALTER TABLE tasks ADD COLUMN parent_task_id TEXT`);
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id)`,
  );
  dropLegacyTaskColumns(db);

  // site_links: category (서비스 분류)
  const siteLinksHadCategory = tableHasColumn(db, "site_links", "category");
  if (!siteLinksHadCategory) {
    db.exec(`ALTER TABLE site_links ADD COLUMN category TEXT`);
  }
  // 인덱스는 반드시 ALTER TABLE ADD COLUMN 이후에 생성해야 함
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_site_links_category ON site_links(category)`,
  );

  seedSiteLinksIfEmpty(db);
  backfillSiteLinkCategories(db);
  backfillTaskAssignees(db);
  ensureLineWorksLinkPreviewSchema(db);
}

function ensureLineWorksLinkPreviewSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS line_works_link_previews (
      url           TEXT PRIMARY KEY,
      title         TEXT,
      description   TEXT,
      image_url     TEXT,
      site_name     TEXT,
      status        TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      fetched_at    TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (status IN ('success', 'failed'))
    ) STRICT
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_line_works_link_previews_fetched
      ON line_works_link_previews(fetched_at DESC)
  `);
}

function dropLegacyTaskColumns(db: DatabaseSync): void {
  const hasLegacyColumns =
    tableHasColumn(db, "tasks", "lineage_id") ||
    tableHasColumn(db, "tasks", "carryover_count") ||
    tableHasColumn(db, "tasks", "carried_from_date");

  if (!hasLegacyColumns) return;

  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN");

  try {
    db.exec(`DROP TABLE IF EXISTS tasks__migrated`);
    db.exec(`DROP VIEW IF EXISTS v_today_task_summary`);
    db.exec(`
      CREATE TABLE tasks__migrated (
        id TEXT PRIMARY KEY,
        work_date TEXT NOT NULL,
        parent_task_id TEXT,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'medium',
        due_date TEXT NOT NULL,
        due_time TEXT,
        estimate_minutes INTEGER NOT NULL DEFAULT 30,
        note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        created_by_user_id TEXT,
        assignee_user_id TEXT,
        FOREIGN KEY (work_date) REFERENCES work_days(work_date) ON DELETE CASCADE,
        FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
        CHECK (priority IN ('high', 'medium', 'low')),
        CHECK (status IN ('todo', 'doing', 'done')),
        CHECK (estimate_minutes >= 0),
        CHECK (length(due_date) = 10)
      ) STRICT
    `);
    db.exec(`
      INSERT INTO tasks__migrated (
        id, work_date, parent_task_id, title, category, priority, due_date, due_time,
        estimate_minutes, note, status, sort_order,
        created_at, updated_at, completed_at,
        created_by_user_id, assignee_user_id
      )
      SELECT
        id, work_date, parent_task_id, title, category, priority, due_date, due_time,
        estimate_minutes, note, status, sort_order,
        created_at, updated_at, completed_at,
        created_by_user_id, assignee_user_id
      FROM tasks
    `);
    db.exec(`DROP TABLE tasks`);
    db.exec(`ALTER TABLE tasks__migrated RENAME TO tasks`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_tasks_work_date ON tasks(work_date)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_tasks_work_date_status ON tasks(work_date, status)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_tasks_work_date_priority ON tasks(work_date, priority)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_tasks_due_date_status ON tasks(due_date, status)`,
    );
    db.exec(`
      CREATE VIEW IF NOT EXISTS v_today_task_summary AS
      SELECT
        work_date,
        COUNT(*) AS total_tasks,
        SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) AS todo_tasks,
        SUM(CASE WHEN status = 'doing' THEN 1 ELSE 0 END) AS doing_tasks,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_tasks,
        SUM(CASE WHEN priority = 'high' AND status <> 'done' THEN 1 ELSE 0 END) AS open_high_priority_tasks,
        SUM(CASE WHEN due_date < work_date AND status <> 'done' THEN 1 ELSE 0 END) AS overdue_tasks
      FROM tasks
      GROUP BY work_date
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

/**
 * 단일 assignee_user_id → 정규화된 task_assignees 로 1회 복사.
 * task_assignees 가 비어있고 tasks.assignee_user_id 에 값이 있을 때만 실행.
 */
function backfillTaskAssignees(db: DatabaseSync): void {
  if (!tableHasColumn(db, "tasks", "assignee_user_id")) return;
  const existing = db
    .prepare(`SELECT COUNT(*) AS c FROM task_assignees`)
    .get() as { c: number } | undefined;
  if ((existing?.c ?? 0) > 0) return;

  db.exec(`
    INSERT OR IGNORE INTO task_assignees (task_id, user_id)
    SELECT id, assignee_user_id FROM tasks
     WHERE assignee_user_id IS NOT NULL AND TRIM(assignee_user_id) <> ''
  `);
}

function inferSiteLinkCategory(label: string, url: string): string {
  const haystack = `${label} ${url}`.toLowerCase();
  if (/보고팡|vogopang|dobedub/.test(haystack)) return "보고팡";
  if (/푸딩툰|puddingtoon/.test(haystack)) return "푸딩툰";
  if (/픽미툰|pickmetoon/.test(haystack)) return "픽미툰";
  if (/덥라이트|dubright/.test(haystack)) return "덥라이트";
  return "기타";
}

function seedSiteLinksIfEmpty(db: DatabaseSync): void {
  const count =
    (
      db.prepare(`SELECT COUNT(*) AS c FROM site_links`).get() as
        | { c: number }
        | undefined
    )?.c ?? 0;
  if (count > 0) return;

  const seeds: Array<{ label: string; url: string; category: string }> = [
    {
      label: "보고팡 운영",
      url: "https://dobedub.vogopang.com/library-hub",
      category: "보고팡",
    },
    {
      label: "보고팡 개발",
      url: "https://dev.vogopang.com/login?reason=auth_required&redirect=%2F",
      category: "보고팡",
    },
    {
      label: "보고팡 브로셔",
      url: "https://senior.dobedub.org/home",
      category: "보고팡",
    },
    {
      label: "푸딩툰 이용자",
      url: "https://www.puddingtoon.com/home",
      category: "푸딩툰",
    },
    {
      label: "푸딩툰 이용자 개발",
      url: "https://test.puddingtoon.org/home",
      category: "푸딩툰",
    },
    {
      label: "푸딩툰 관리자",
      url: "https://admin2.puddingtoon.org",
      category: "푸딩툰",
    },
    {
      label: "푸딩툰 관리자 개발",
      url: "https://dev-admin.puddingtoon.org/login",
      category: "푸딩툰",
    },
    {
      label: "픽미툰 이용자",
      url: "https://www.pickmetoon.com",
      category: "픽미툰",
    },
    {
      label: "픽미툰 이용자 개발",
      url: "https://dev.pickmetoon.com",
      category: "픽미툰",
    },
    {
      label: "픽미툰 관리자",
      url: "https://admin.pickmetoon.com",
      category: "픽미툰",
    },
    {
      label: "픽미툰 관리자 개발",
      url: "https://admindev.pickmetoon.com",
      category: "픽미툰",
    },
    {
      label: "덥라이트 운영",
      url: "https://staging.dubright.org",
      category: "덥라이트",
    },
    {
      label: "덥라이트 개발",
      url: "https://test2.dubright.org",
      category: "덥라이트",
    },
  ];

  const stmt = db.prepare(
    `INSERT INTO site_links (label, url, category, sort_order) VALUES (?, ?, ?, ?)`,
  );
  for (let i = 0; i < seeds.length; i++) {
    stmt.run(seeds[i].label, seeds[i].url, seeds[i].category, i);
  }
}

function backfillSiteLinkCategories(db: DatabaseSync): void {
  const rows = db
    .prepare(
      `SELECT id, label, url FROM site_links
        WHERE category IS NULL OR TRIM(category) = ''`,
    )
    .all() as Array<{ id: number; label: string; url: string }>;
  if (rows.length === 0) return;
  const update = db.prepare(`UPDATE site_links SET category = ? WHERE id = ?`);
  for (const row of rows) {
    update.run(inferSiteLinkCategory(row.label, row.url), row.id);
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
