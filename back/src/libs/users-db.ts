import { getDatabase } from "@libs/sqlite-db";

export interface UserRow {
  userId: string;
  userName: string | null;
  email: string | null;
  domainId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

interface UserDbRow {
  user_id: string;
  user_name: string | null;
  email: string | null;
  domain_id: string | null;
  last_login_at: string | null;
  created_at: string;
}

function hydrate(row: UserDbRow): UserRow {
  return {
    userId: row.user_id,
    userName: row.user_name,
    email: row.email,
    domainId: row.domain_id,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export function upsertUser(input: {
  userId: string;
  userName: string | null;
  email: string | null;
  domainId: string | null;
}): void {
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO users (user_id, user_name, email, domain_id, last_login_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        user_name = COALESCE(excluded.user_name, users.user_name),
        email = COALESCE(excluded.email, users.email),
        domain_id = COALESCE(excluded.domain_id, users.domain_id),
        last_login_at = excluded.last_login_at
    `,
  ).run(input.userId, input.userName, input.email, input.domainId);
}

export function listUsers(): UserRow[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT user_id, user_name, email, domain_id, last_login_at, created_at
         FROM users
        ORDER BY user_name ASC`,
    )
    .all() as unknown as UserDbRow[];
  return rows.map(hydrate);
}

export function getUser(userId: string): UserRow | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT user_id, user_name, email, domain_id, last_login_at, created_at
         FROM users WHERE user_id = ?`,
    )
    .get(userId) as UserDbRow | undefined;
  return row ? hydrate(row) : null;
}
