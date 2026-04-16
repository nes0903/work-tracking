import { Injectable } from "@nestjs/common";
import {
  getGithubFeed,
  getNotionFeed,
  type NotionFeedQuery,
} from "@libs/feed-store";

@Injectable()
export class FeedsRepository {
  getNotionFeed(query: NotionFeedQuery) {
    return getNotionFeed(query);
  }

  getGithubFeed() {
    return getGithubFeed();
  }
}
