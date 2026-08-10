import { getDatabase } from "./postgres-db";

export async function getLastSeenMap(
  userId: string,
): Promise<Record<string, string>> {
  const db = getDatabase();
  const rows = await db
    .prepare(
      `SELECT source, last_seen_at FROM user_last_seen WHERE user_id = ?`,
    )
    .all(userId);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.source] = row.last_seen_at;
  }
  return result;
}

export async function setLastSeen(
  userId: string,
  source: string,
  atISO: string,
): Promise<void> {
  const db = getDatabase();
  await db
    .prepare(
      `
      INSERT INTO user_last_seen (user_id, source, last_seen_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, source) DO UPDATE SET
        last_seen_at = excluded.last_seen_at
    `,
    )
    .run(userId, source, atISO);
}

/**
 * Notion 이벤트 개별 read 기록. 중복은 PK 충돌로 무시.
 */
export async function markNotionRead(
  userId: string,
  eventIds: string[],
): Promise<number> {
  if (eventIds.length === 0) return 0;
  const db = getDatabase();
  const stmt = db.prepare(
    `INSERT INTO user_notion_read (user_id, event_id)
     VALUES (?, ?)
     ON CONFLICT (user_id, event_id) DO NOTHING`,
  );
  let inserted = 0;
  for (const id of eventIds) {
    const trimmed = typeof id === "string" ? id.trim() : "";
    if (!trimmed) continue;
    const result = await stmt.run(userId, trimmed);
    if (result.changes > 0) inserted++;
  }
  return inserted;
}

/**
 * 주어진 event_ids 중 유저가 읽은 것만 Set 으로 반환.
 */
export function getNotionReadSet(
  userId: string,
  eventIds: string[],
): Promise<Set<string>> {
  const result = new Set<string>();
  if (eventIds.length === 0) return Promise.resolve(result);
  const db = getDatabase();
  const placeholders = eventIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT event_id FROM user_notion_read
        WHERE user_id = ? AND event_id IN (${placeholders})`,
    )
    .all<{ event_id: string }>(userId, ...eventIds)
    .then((rows) => {
      for (const row of rows) result.add(row.event_id);
      return result;
    });
}
