import {
  Controller,
  Get,
  Query,
  Req,
  Sse,
  MessageEvent,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { Observable } from "rxjs";
import { AuthGuard } from "@common/auth.guard";
import { FeedsService } from "../applications/feeds.service";
import { onFeedUpdate, type FeedUpdateEvent } from "@libs/feed-events";

@Controller("api")
export class FeedsController {
  constructor(private readonly feedsService: FeedsService) {}

  @Get("notion-updates")
  @UseGuards(AuthGuard)
  async getNotionFeed(
    @Query("page") pageParam: string | undefined,
    @Query("perPage") perPageParam: string | undefined,
    @Req() req: Request,
  ) {
    const page = Number(pageParam);
    const perPage = Number(perPageParam);
    return this.feedsService.getNotionFeed(
      {
        page: Number.isFinite(page) && page > 0 ? Math.floor(page) : undefined,
        perPage:
          Number.isFinite(perPage) && perPage > 0
            ? Math.floor(perPage)
            : undefined,
      },
      req.auth?.userId ?? null,
    );
  }

  @Get("github-updates")
  @UseGuards(AuthGuard)
  async getGithubFeed() {
    return this.feedsService.getGithubFeed();
  }

  @Sse("events")
  @UseGuards(AuthGuard)
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
