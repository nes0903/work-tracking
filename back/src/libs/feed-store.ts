import {
  getGithubFeedFromStore,
  getNotionFeedFromStore,
} from "@libs/dashboard-db";
import { emptyGithubFeed, emptyNotionFeed } from "@libs/work-tracking";

export async function getNotionFeed() {
  return getNotionFeedFromStore() ?? emptyNotionFeed();
}

export async function getGithubFeed() {
  return getGithubFeedFromStore() ?? emptyGithubFeed();
}
