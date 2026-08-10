import { randomBytes } from "node:crypto";
import { getDatabase } from "./postgres-db";

export interface SessionRow {
  id: string;
  userId: string;
  userName: string | null;
  email: string | null;
  domainId: string | null;
  expiresAt: string;
}

const SESSION_TTL_HOURS = 24;
const OAUTH_STATE_TTL_MINUTES = 10;

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export async function createSession(input: {
  userId: string;
  userName: string | null;
  email: string | null;
  domainId: string | null;
}): Promise<SessionRow> {
  const db = getDatabase();
  const id = generateToken(32);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_HOURS * 3_600_000,
  ).toISOString();

  await db
    .prepare(
      `
      INSERT INTO auth_sessions (id, user_id, user_name, email, domain_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      id,
      input.userId,
      input.userName,
      input.email,
      input.domainId,
      expiresAt,
    );

  return {
    id,
    userId: input.userId,
    userName: input.userName,
    email: input.email,
    domainId: input.domainId,
    expiresAt,
  };
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const db = getDatabase();
  const row = await db
    .prepare(
      `
        SELECT id, user_id, user_name, email, domain_id, expires_at
        FROM auth_sessions
        WHERE id = ? AND expires_at > datetime('now')
      `,
    )
    .get(id);

  if (!row) {
    return null;
  }

  await db
    .prepare(
      `UPDATE auth_sessions SET last_seen_at = datetime('now') WHERE id = ?`,
    )
    .run(id);

  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    email: row.email,
    domainId: row.domain_id,
    expiresAt: row.expires_at,
  };
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDatabase();
  await db.prepare(`DELETE FROM auth_sessions WHERE id = ?`).run(id);
}

export async function purgeExpired(): Promise<void> {
  const db = getDatabase();
  await db.transaction(async (transaction) => {
    await transaction.exec(
      `DELETE FROM auth_sessions WHERE expires_at < datetime('now')`,
    );
    await transaction.exec(
      `DELETE FROM auth_oauth_states WHERE expires_at < datetime('now')`,
    );
  });
}

export async function createOAuthState(redirectTo = "/"): Promise<string> {
  const db = getDatabase();
  const state = generateToken(24);
  const expiresAt = new Date(
    Date.now() + OAUTH_STATE_TTL_MINUTES * 60_000,
  ).toISOString();
  await db
    .prepare(
      `INSERT INTO auth_oauth_states (state, redirect_to, expires_at) VALUES (?, ?, ?)`,
    )
    .run(state, redirectTo, expiresAt);
  return state;
}

export async function consumeOAuthState(
  state: string,
): Promise<{ redirectTo: string } | null> {
  const db = getDatabase();
  return db.transaction(async (transaction) => {
    const row = await transaction
      .prepare(
        `SELECT state, redirect_to FROM auth_oauth_states WHERE state = ? AND expires_at > datetime('now')`,
      )
      .get(state);

    if (!row) {
      return null;
    }

    await transaction
      .prepare(`DELETE FROM auth_oauth_states WHERE state = ?`)
      .run(state);
    return { redirectTo: row.redirect_to };
  });
}

export const SESSION_TTL_SECONDS = SESSION_TTL_HOURS * 60 * 60;
