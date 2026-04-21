import {
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
}

export async function getNotionFeed(
  query: NotionFeedQuery = {},
  userId: string | null,
): Promise<NotionFeedResult> {
  const page = Number.isFinite(query.page) ? Number(query.page) : 1;
  const perPage = Number.isFinite(query.perPage) ? Number(query.perPage) : 20;
  const feed = listNotionUpdateEvents(page, perPage);

  let readEventIds: string[] = [];
  if (userId) {
    const ids = feed.items
      .map((it) => it.eventId)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    const readSet = getNotionReadSet(userId, ids);
    readEventIds = ids.filter((id) => readSet.has(id));
  }

  return { ...feed, readEventIds };
}

export async function getGithubFeed() {
  return getGithubFeedFromStore() ?? emptyGithubFeed();
}
