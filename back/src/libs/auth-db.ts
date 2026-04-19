import { randomBytes } from "node:crypto";
import { getDatabase } from "@libs/sqlite-db";

export interface SessionRow {
  id: string;
  userId: string;
  userName: string | null;
  email: string | null;
  domainId: string | null;
  expiresAt: string;
}

const SESSION_TTL_DAYS = 14;
const OAUTH_STATE_TTL_MINUTES = 10;

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function createSession(input: {
  userId: string;
  userName: string | null;
  email: string | null;
  domainId: string | null;
}): SessionRow {
  const db = getDatabase();
  const id = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000).toISOString();

  db.prepare(
    `
      INSERT INTO auth_sessions (id, user_id, user_name, email, domain_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(id, input.userId, input.userName, input.email, input.domainId, expiresAt);

  return {
    id,
    userId: input.userId,
    userName: input.userName,
    email: input.email,
    domainId: input.domainId,
    expiresAt,
  };
}

export function getSession(id: string): SessionRow | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
        SELECT id, user_id, user_name, email, domain_id, expires_at
        FROM auth_sessions
        WHERE id = ? AND expires_at > datetime('now')
      `,
    )
    .get(id) as
    | {
        id: string;
        user_id: string;
        user_name: string | null;
        email: string | null;
        domain_id: string | null;
        expires_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  db.prepare(`UPDATE auth_sessions SET last_seen_at = datetime('now') WHERE id = ?`).run(id);

  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    email: row.email,
    domainId: row.domain_id,
    expiresAt: row.expires_at,
  };
}

export function deleteSession(id: string): void {
  const db = getDatabase();
  db.prepare(`DELETE FROM auth_sessions WHERE id = ?`).run(id);
}

export function purgeExpired(): void {
  const db = getDatabase();
  db.exec(`DELETE FROM auth_sessions WHERE expires_at < datetime('now')`);
  db.exec(`DELETE FROM auth_oauth_states WHERE expires_at < datetime('now')`);
}

export function createOAuthState(redirectTo = "/"): string {
  const db = getDatabase();
  const state = generateToken(24);
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MINUTES * 60_000).toISOString();
  db.prepare(
    `INSERT INTO auth_oauth_states (state, redirect_to, expires_at) VALUES (?, ?, ?)`,
  ).run(state, redirectTo, expiresAt);
  return state;
}

export function consumeOAuthState(state: string): { redirectTo: string } | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT state, redirect_to FROM auth_oauth_states WHERE state = ? AND expires_at > datetime('now')`,
    )
    .get(state) as { state: string; redirect_to: string } | undefined;

  if (!row) {
    return null;
  }

  db.prepare(`DELETE FROM auth_oauth_states WHERE state = ?`).run(state);
  return { redirectTo: row.redirect_to };
}

export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;
