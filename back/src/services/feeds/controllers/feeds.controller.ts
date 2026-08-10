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
import { getLatestFeedEventId, listFeedEventsAfter } from "@libs/feed-events";

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
  streamFeedEvents(@Req() request: Request): Observable<MessageEvent> {
    const rawLastEventId = request.headers["last-event-id"];
    const parsedLastEventId = Number(
      Array.isArray(rawLastEventId) ? rawLastEventId[0] : rawLastEventId,
    );
    const resumeFrom =
      Number.isInteger(parsedLastEventId) && parsedLastEventId >= 0
        ? parsedLastEventId
        : null;

    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      let polling = false;
      let lastEventId = 0;

      subscriber.next({
        type: "ready",
        data: { at: new Date().toISOString() },
      });

      const initialize = async () => {
        lastEventId = resumeFrom ?? (await getLatestFeedEventId());
      };

      const poll = async () => {
        if (closed || polling) return;
        polling = true;
        try {
          for (const event of await listFeedEventsAfter(lastEventId)) {
            lastEventId = event.id;
            subscriber.next({
              id: String(event.id),
              type: "feed-update",
              data: { source: event.source, at: event.at },
            });
          }
        } catch (error) {
          console.error("[feeds] event polling failed", error);
        } finally {
          polling = false;
        }
      };

      void initialize()
        .then(poll)
        .catch((error) => {
          console.error("[feeds] event stream initialization failed", error);
        });

      const poller = setInterval(() => void poll(), 2_000);

      const heartbeat = setInterval(() => {
        subscriber.next({
          type: "heartbeat",
          data: { at: new Date().toISOString() },
        });
      }, 25_000);

      return () => {
        closed = true;
        clearInterval(poller);
        clearInterval(heartbeat);
      };
    });
  }
}
