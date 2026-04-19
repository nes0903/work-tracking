import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@common/auth.guard";
import { listArchive } from "@libs/line-works-bot-db";

@Controller("api/line-works-archive")
@UseGuards(AuthGuard)
export class LineWorksArchiveController {
  @Get()
  list(
    @Query("channelId") channelId?: string,
    @Query("limit") limitStr?: string,
  ) {
    const limit = limitStr ? Number(limitStr) : undefined;
    const result = listArchive({
      channelId: channelId && channelId.trim() ? channelId.trim() : undefined,
      limit: Number.isFinite(limit) ? (limit as number) : undefined,
    });
    return { ok: true, ...result };
  }
}
