import { getDatabase } from "@libs/postgres-db";

export type FeedSource = "notion" | "github" | "line-works";

export interface FeedUpdateEvent {
  source: FeedSource;
  at: string;
}

export interface StoredFeedUpdateEvent extends FeedUpdateEvent {
  id: number;
}

export async function emitFeedUpdate(source: FeedSource): Promise<void> {
  await getDatabase()
    .prepare(`INSERT INTO feed_events (source) VALUES (?)`)
    .run(source);
}

export async function getLatestFeedEventId(): Promise<number> {
  const row = await getDatabase()
    .prepare(`SELECT COALESCE(MAX(id), 0) AS id FROM feed_events`)
    .get();
  return Number(row?.id ?? 0);
}

export async function listFeedEventsAfter(
  lastEventId: number,
  limit = 100,
): Promise<StoredFeedUpdateEvent[]> {
  const rows = await getDatabase()
    .prepare(
      `SELECT id, source, created_at
         FROM feed_events
        WHERE id > ?
        ORDER BY id ASC
        LIMIT ?`,
    )
    .all(lastEventId, limit);
  return rows.map((row) => ({
    id: Number(row.id),
    source: row.source,
    at: row.created_at,
  }));
}
