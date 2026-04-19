import { getDatabase } from "@libs/sqlite-db";

export function getLastSeenMap(userId: string): Record<string, string> {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT source, last_seen_at FROM user_last_seen WHERE user_id = ?`,
    )
    .all(userId) as unknown as Array<{ source: string; last_seen_at: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.source] = row.last_seen_at;
  }
  return result;
}

export function setLastSeen(userId: string, source: string, atISO: string): void {
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO user_last_seen (user_id, source, last_seen_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, source) DO UPDATE SET
        last_seen_at = excluded.last_seen_at
    `,
  ).run(userId, source, atISO);
}
