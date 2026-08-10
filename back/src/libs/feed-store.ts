import {
  countNewNotionUpdateEvents,
  getGithubFeedFromStore,
  listNotionUpdateEvents,
  type NotionFeedPage,
} from "@libs/dashboard-db";
import { emptyGithubFeed } from "@libs/work-tracking";
import { getNotionReadSet } from "@libs/last-seen-db";

export interface NotionFeedQuery {
  page?: number;
  perPage?: number;
}

export interface NotionFeedResult extends NotionFeedPage {
  readEventIds: string[];
  newCount: number;
}

export async function getNotionFeed(
  query: NotionFeedQuery = {},
  userId: string | null,
): Promise<NotionFeedResult> {
  const page = Number.isFinite(query.page) ? Number(query.page) : 1;
  const perPage = Number.isFinite(query.perPage) ? Number(query.perPage) : 20;
  const feed = await listNotionUpdateEvents(page, perPage);

  let readEventIds: string[] = [];
  let newCount = 0;
  if (userId) {
    const ids = feed.items
      .map((it) => it.eventId)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    const readSet = await getNotionReadSet(userId, ids);
    readEventIds = ids.filter((id) => readSet.has(id));
    newCount = await countNewNotionUpdateEvents(userId);
  }

  return { ...feed, readEventIds, newCount };
}

export async function getGithubFeed() {
  return getGithubFeedFromStore() ?? emptyGithubFeed();
}
