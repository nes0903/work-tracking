import { Injectable } from "@nestjs/common";
import type { NotionFeedQuery } from "@libs/feed-store";
import { FeedsRepository } from "../repository/feeds.repository";

@Injectable()
export class FeedsService {
  constructor(private readonly feedsRepository: FeedsRepository) {}

  getNotionFeed(query: NotionFeedQuery, userId: string | null) {
    return this.feedsRepository.getNotionFeed(query, userId);
  }

  getGithubFeed() {
    return this.feedsRepository.getGithubFeed();
  }
}
