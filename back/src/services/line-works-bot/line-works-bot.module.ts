import { Module } from "@nestjs/common";
import { LineWorksBotService } from "./applications/line-works-bot.service";
import { LineWorksArchiveController } from "./controllers/line-works-archive.controller";
import { LineWorksAttachmentsController } from "./controllers/line-works-attachments.controller";
import { LineWorksBotWebhookController } from "./controllers/line-works-bot-webhook.controller";

@Module({
  controllers: [
    LineWorksBotWebhookController,
    LineWorksAttachmentsController,
    LineWorksArchiveController,
  ],
  providers: [LineWorksBotService],
})
export class LineWorksBotModule {}
