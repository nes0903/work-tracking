import {
  getGithubFeedFromStore,
  listNotionUpdateEvents,
  type NotionFeedPage,
} from "@libs/dashboard-db";
import { emptyGithubFeed } from "@libs/work-tracking";

export interface NotionFeedQuery {
  limit?: number;
  cursor?: string | null;
}

export async function getNotionFeed(
  query: NotionFeedQuery = {},
): Promise<NotionFeedPage> {
  const limit = Number.isFinite(query.limit)
    ? Math.max(1, Math.min(Number(query.limit), 50))
    : 10;
  const cursor = query.cursor ?? null;
  return listNotionUpdateEvents(limit, cursor);
}

export async function getGithubFeed() {
  return getGithubFeedFromStore() ?? emptyGithubFeed();
}
