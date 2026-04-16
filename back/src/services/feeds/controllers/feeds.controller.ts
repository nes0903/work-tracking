import { Controller, Get, Query } from "@nestjs/common";
import { FeedsService } from "../applications/feeds.service";

@Controller("api")
export class FeedsController {
  constructor(private readonly feedsService: FeedsService) {}

  @Get("notion-updates")
  async getNotionFeed(
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.feedsService.getNotionFeed({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      cursor: cursor ?? null,
    });
  }

  @Get("github-updates")
  async getGithubFeed() {
    return this.feedsService.getGithubFeed();
  }
}
