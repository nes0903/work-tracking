import postgres, { type Sql } from "postgres";

declare global {
  var __workTrackingPostgres__: Sql | undefined;
}

export interface RunResult {
  changes: number;
}

export interface PreparedQuery {
  all<T = any>(...params: unknown[]): Promise<T[]>;
  get<T = any>(...params: unknown[]): Promise<T | undefined>;
  run(...params: unknown[]): Promise<RunResult>;
}

export interface DatabaseClient {
  prepare(query: string): PreparedQuery;
  exec(query: string, params?: unknown[]): Promise<RunResult>;
  transaction<T>(callback: (db: DatabaseClient) => Promise<T>): Promise<T>;
}

function loadDatabaseUrl(): string {
  const value = process.env.SUPABASE_DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!value) {
    throw new Error(
      "Supabase database is not configured (SUPABASE_DATABASE_URL or POSTGRES_URL is missing)",
    );
  }
  return value;
}

function replaceQuestionMarkParameters(query: string): string {
  let parameterIndex = 0;
  let quote: "'" | '"' | null = null;
  let result = "";

  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];
    const next = query[index + 1];

    if (quote) {
      result += character;
      if (character === quote) {
        if (next === quote) {
          result += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      result += character;
      continue;
    }

    if (character === "?") {
      parameterIndex += 1;
      result += `$${parameterIndex}`;
      continue;
    }

    result += character;
  }

  return result;
}

function normalizeSqliteSyntax(query: string): string {
  return replaceQuestionMarkParameters(query)
    .replace(/datetime\(\s*'now'\s*\)/gi, "CURRENT_TIMESTAMP")
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
}

function createDatabaseClient(sql: Sql): DatabaseClient {
  const normalizeParameters = (params: unknown[]) =>
    params.map((value) => (value === undefined ? null : value)) as never[];

  return {
    prepare(query: string): PreparedQuery {
      const normalized = normalizeSqliteSyntax(query);
      return {
        async all<T>(...params: unknown[]): Promise<T[]> {
          const rows = await sql.unsafe(
            normalized,
            normalizeParameters(params),
          );
          return rows as unknown as T[];
        },
        async get<T>(...params: unknown[]): Promise<T | undefined> {
          const rows = await sql.unsafe(
            normalized,
            normalizeParameters(params),
          );
          return rows[0] as T | undefined;
        },
        async run(...params: unknown[]): Promise<RunResult> {
          const rows = await sql.unsafe(
            normalized,
            normalizeParameters(params),
          );
          return { changes: rows.count };
        },
      };
    },
    async exec(query: string, params: unknown[] = []): Promise<RunResult> {
      const rows = await sql.unsafe(
        normalizeSqliteSyntax(query),
        normalizeParameters(params),
      );
      return { changes: rows.count };
    },
    async transaction<T>(
      callback: (db: DatabaseClient) => Promise<T>,
    ): Promise<T> {
      return sql.begin(async (transactionSql) =>
        callback(createDatabaseClient(transactionSql as unknown as Sql)),
      ) as Promise<T>;
    },
  };
}

export function getDatabase(): DatabaseClient {
  if (!globalThis.__workTrackingPostgres__) {
    globalThis.__workTrackingPostgres__ = postgres(loadDatabaseUrl(), {
      prepare: false,
      max: Number(process.env.POSTGRES_POOL_MAX || 3),
      idle_timeout: Number(process.env.POSTGRES_IDLE_TIMEOUT_SECONDS || 20),
      connect_timeout: Number(
        process.env.POSTGRES_CONNECT_TIMEOUT_SECONDS || 10,
      ),
      ssl: process.env.NODE_ENV === "production" ? "require" : undefined,
      onnotice: () => undefined,
      transform: {
        value: {
          from(value, column) {
            if (value instanceof Date) {
              const iso = value.toISOString();
              return column.type === 1082 ? iso.slice(0, 10) : iso;
            }
            if (typeof value === "bigint") return Number(value);
            return value;
          },
        },
      },
    });
  }

  return createDatabaseClient(globalThis.__workTrackingPostgres__);
}

export async function closeDatabase(): Promise<void> {
  const sql = globalThis.__workTrackingPostgres__;
  globalThis.__workTrackingPostgres__ = undefined;
  if (sql) {
    await sql.end({ timeout: 5 });
  }
}
