import { Controller, HttpException, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@common/auth.guard";
import { getDatabase } from "@libs/sqlite-db";
import {
  fetchBotScopedUserName,
  fetchChannelInfo,
  loadBotConfig,
} from "@libs/line-works-bot";
import { upsertChannelMeta } from "@libs/line-works-bot-db";

@Controller("api/line-works-channels")
@UseGuards(AuthGuard)
export class LineWorksChannelsController {
  @Post("refresh")
  async refresh() {
    const botConfig = loadBotConfig();
    if (!botConfig) {
      throw new HttpException(
        { ok: false, error: "LINE WORKS bot is not configured" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const db = getDatabase();
    const rows = db
      .prepare(
        `
          SELECT DISTINCT m.channel_id
            FROM line_works_messages m
            LEFT JOIN line_works_channels c ON c.channel_id = m.channel_id
           WHERE c.channel_id IS NULL OR c.title IS NULL OR c.title = ''
        `,
      )
      .all() as unknown as Array<{ channel_id: string }>;

    let resolved = 0;
    let failed = 0;
    for (const row of rows) {
      const channelId = row.channel_id;
      try {
        if (channelId.startsWith("dm:")) {
          const userId = channelId.slice(3);
          const name = await fetchBotScopedUserName(botConfig, userId);
          upsertChannelMeta({
            channelId,
            title: name,
            channelType: "SINGLE_USER",
            userId,
          });
          if (name) resolved += 1;
          else failed += 1;
        } else {
          const info = await fetchChannelInfo(botConfig, channelId);
          upsertChannelMeta({
            channelId,
            title: info?.title ?? null,
            channelType: info?.channelType ?? null,
            userId: null,
          });
          if (info?.title) resolved += 1;
          else failed += 1;
        }
      } catch {
        failed += 1;
      }
    }

    return {
      ok: true,
      totalPending: rows.length,
      resolved,
      failed,
    };
  }
}
