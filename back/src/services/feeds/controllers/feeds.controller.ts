import { Controller, Get } from "@nestjs/common";
import { FeedsService } from "../applications/feeds.service";

@Controller("api")
export class FeedsController {
  constructor(private readonly feedsService: FeedsService) {}

  @Get("notion-updates")
  async getNotionFeed() {
    return this.feedsService.getNotionFeed();
  }

  @Get("github-updates")
  async getGithubFeed() {
    return this.feedsService.getGithubFeed();
  }
}
