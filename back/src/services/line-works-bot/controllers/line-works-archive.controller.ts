import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@common/auth.guard";
import { listArchive } from "@libs/line-works-bot-db";

@Controller("api/line-works-archive")
@UseGuards(AuthGuard)
export class LineWorksArchiveController {
  @Get()
  list(
    @Query("channelId") channelId?: string,
    @Query("page") pageStr?: string,
    @Query("perPage") perPageStr?: string,
  ) {
    const page = pageStr ? Number(pageStr) : undefined;
    const perPage = perPageStr ? Number(perPageStr) : undefined;
    const result = listArchive({
      channelId: channelId && channelId.trim() ? channelId.trim() : undefined,
      page: Number.isFinite(page) ? (page as number) : undefined,
      perPage: Number.isFinite(perPage) ? (perPage as number) : undefined,
    });
    return { ok: true, ...result };
  }
}
