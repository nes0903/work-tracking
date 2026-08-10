import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

const TABLES = [
  "app_settings",
  "work_days",
  "tasks",
  "task_assignees",
  "focus_sessions",
  "notion_sync_runs",
  "notion_pages_snapshot",
  "notion_update_events",
  "github_sync_runs",
  "github_repo_snapshots",
  "github_pull_request_snapshots",
  "github_commit_events",
  "github_pr_events",
  "auth_sessions",
  "auth_oauth_states",
  "line_works_messages",
  "line_works_attachments",
  "line_works_links",
  "line_works_link_previews",
  "line_works_channels",
  "users",
  "user_last_seen",
  "user_notion_read",
  "task_references",
  "site_link_categories",
  "site_links",
] as const;

const IDENTITY_TABLES = [
  "notion_sync_runs",
  "github_sync_runs",
  "line_works_attachments",
  "line_works_links",
  "task_references",
  "site_links",
] as const;

type SqliteRow = Record<string, string | number | bigint | Uint8Array | null>;

const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
const sourcePath = path.resolve(
  sourceArg?.slice("--source=".length) ||
    path.join(__dirname, "..", "sqlite", "work-tracking.sqlite3"),
);
const dryRun = process.argv.includes("--dry-run");

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function sourceTableExists(db: DatabaseSync, table: string): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get(table),
  );
}

function sourceRows(db: DatabaseSync, table: string): SqliteRow[] {
  return db.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all() as SqliteRow[];
}

function mapRow(table: string, row: SqliteRow): SqliteRow {
  const mapped = { ...row };
  if (table === "line_works_attachments") {
    mapped.storage_bucket = mapped.s3_bucket;
    mapped.storage_path = mapped.s3_key;
    delete mapped.s3_bucket;
    delete mapped.s3_key;
  }
  if (table === "tasks") {
    mapped.parent_task_id = null;
  }
  return mapped;
}

async function main(): Promise<void> {
  if (!existsSync(sourcePath)) {
    throw new Error(`SQLite source file not found: ${sourcePath}`);
  }

  const source = new DatabaseSync(sourcePath);
  const counts = TABLES.map((table) => ({
    table,
    count: sourceTableExists(source, table) ? sourceRows(source, table).length : 0,
  }));

  console.table(counts);
  if (dryRun) {
    console.log(`[dry-run] source verified: ${sourcePath}`);
    source.close();
    return;
  }

  const databaseUrl =
    process.env.SUPABASE_DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!databaseUrl) {
    throw new Error("SUPABASE_DATABASE_URL or POSTGRES_URL is required");
  }

  const taskParentRows = sourceTableExists(source, "tasks")
    ? sourceRows(source, "tasks")
        .filter((row) => row.parent_task_id)
        .map((row) => ({ id: String(row.id), parentId: String(row.parent_task_id) }))
    : [];

  const isLocal = /(?:localhost|127\.0\.0\.1):/.test(databaseUrl);
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    ssl: isLocal ? false : "require",
  });

  try {
    await sql.begin(async (transaction) => {
      for (const table of TABLES) {
        if (!sourceTableExists(source, table)) {
          console.log(`[skip] ${table}: source table does not exist`);
          continue;
        }

        const rows = sourceRows(source, table);
        let inserted = 0;
        for (const sourceRow of rows) {
          const row = mapRow(table, sourceRow);
          const columns = Object.keys(row);
          if (columns.length === 0) continue;
          const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
          const query = `INSERT INTO public.${quoteIdentifier(table)} (${columns
            .map(quoteIdentifier)
            .join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
          const result = await transaction.unsafe(
            query,
            Object.values(row) as never[],
          );
          inserted += result.count;
        }
        console.log(`[import] ${table}: ${inserted}/${rows.length}`);
      }

      for (const relation of taskParentRows) {
        await transaction.unsafe(
          `UPDATE public.tasks SET parent_task_id = $1 WHERE id = $2`,
          [relation.parentId, relation.id] as never[],
        );
      }

      await transaction.unsafe(`
        INSERT INTO public.site_link_categories (name, sort_order)
        SELECT category, MIN(sort_order)
          FROM public.site_links
         WHERE category IS NOT NULL AND BTRIM(category) <> ''
         GROUP BY category
        ON CONFLICT (name) DO NOTHING
      `);

      for (const table of IDENTITY_TABLES) {
        await transaction.unsafe(`
          SELECT setval(
            pg_get_serial_sequence('public.${table}', 'id'),
            COALESCE((SELECT MAX(id) FROM public.${quoteIdentifier(table)}), 1),
            EXISTS (SELECT 1 FROM public.${quoteIdentifier(table)})
          )
        `);
      }
    });
  } finally {
    source.close();
    await sql.end({ timeout: 5 });
  }

  console.log("SQLite → Supabase Postgres migration complete");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
