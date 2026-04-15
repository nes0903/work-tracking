import { Injectable } from "@nestjs/common";
import { FeedsRepository } from "../repository/feeds.repository";

@Injectable()
export class FeedsService {
  constructor(private readonly feedsRepository: FeedsRepository) {}

  getNotionFeed() {
    return this.feedsRepository.getNotionFeed();
  }

  getGithubFeed() {
    return this.feedsRepository.getGithubFeed();
  }
}
