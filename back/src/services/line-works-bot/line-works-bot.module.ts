import { Module } from "@nestjs/common";
import { LineWorksBotService } from "./applications/line-works-bot.service";
import { LineWorksArchiveController } from "./controllers/line-works-archive.controller";
import { LineWorksAttachmentsController } from "./controllers/line-works-attachments.controller";
import { LineWorksBotWebhookController } from "./controllers/line-works-bot-webhook.controller";
import { LineWorksChannelsController } from "./controllers/line-works-channels.controller";
import { LineWorksLinksController } from "./controllers/line-works-links.controller";

@Module({
  controllers: [
    LineWorksBotWebhookController,
    LineWorksAttachmentsController,
    LineWorksArchiveController,
    LineWorksChannelsController,
    LineWorksLinksController,
  ],
  providers: [LineWorksBotService],
})
export class LineWorksBotModule {}
