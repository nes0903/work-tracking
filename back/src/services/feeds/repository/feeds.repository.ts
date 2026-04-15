import { Injectable } from "@nestjs/common";
import { getGithubFeed, getNotionFeed } from "@libs/feed-store";

@Injectable()
export class FeedsRepository {
  getNotionFeed() {
    return getNotionFeed();
  }

  getGithubFeed() {
    return getGithubFeed();
  }
}
