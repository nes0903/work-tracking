import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "@common/auth.guard";
import {
  getLastSeenMap,
  markNotionRead,
  setLastSeen,
} from "@libs/last-seen-db";

const ALLOWED_SOURCES = new Set(["notion", "line-works", "github"]);

@Controller("api/last-seen")
@UseGuards(AuthGuard)
export class LastSeenController {
  @Get()
  read(@Req() req: Request) {
    if (!req.auth) {
      throw new HttpException(
        { ok: false, error: "Unauthorized" },
        HttpStatus.UNAUTHORIZED,
      );
    }
    const map = getLastSeenMap(req.auth.userId);
    return { ok: true, items: map };
  }

  @Post()
  write(@Req() req: Request, @Body() body: { source?: string; at?: string }) {
    if (!req.auth) {
      throw new HttpException(
        { ok: false, error: "Unauthorized" },
        HttpStatus.UNAUTHORIZED,
      );
    }
    const source = (body.source ?? "").trim();
    if (!source || !ALLOWED_SOURCES.has(source)) {
      throw new HttpException(
        { ok: false, error: "Unknown source" },
        HttpStatus.BAD_REQUEST,
      );
    }
    const at = body.at ?? new Date().toISOString();
    setLastSeen(req.auth.userId, source, at);
    return { ok: true, source, at };
  }

  /** Notion 이벤트 1건 이상을 읽음 처리 */
  @Post("notion/read")
  markRead(@Req() req: Request, @Body() body: { eventIds?: unknown }) {
    if (!req.auth) {
      throw new HttpException(
        { ok: false, error: "Unauthorized" },
        HttpStatus.UNAUTHORIZED,
      );
    }
    const raw = body.eventIds;
    const ids = Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === "string")
      : [];
    if (ids.length === 0) {
      throw new HttpException(
        { ok: false, error: "eventIds is required" },
        HttpStatus.BAD_REQUEST,
      );
    }
    const inserted = markNotionRead(req.auth.userId, ids);
    return { ok: true, inserted, count: ids.length };
  }
}
