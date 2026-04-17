import { Controller, Get, Query, Sse, MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import { FeedsService } from "../applications/feeds.service";
import { onFeedUpdate, type FeedUpdateEvent } from "@libs/feed-events";

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

  @Sse("events")
  streamFeedEvents(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({
        type: "ready",
        data: { at: new Date().toISOString() },
      });

      const unsubscribe = onFeedUpdate((event: FeedUpdateEvent) => {
        subscriber.next({
          type: "feed-update",
          data: event,
        });
      });

      const heartbeat = setInterval(() => {
        subscriber.next({
          type: "heartbeat",
          data: { at: new Date().toISOString() },
        });
      }, 25_000);

      return () => {
        unsubscribe();
        clearInterval(heartbeat);
      };
    });
  }
}
