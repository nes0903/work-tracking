import { Module } from "@nestjs/common";
import { NotionWebhookController } from "./controllers/notion-webhook.controller";
import { NotionWebhookService } from "./applications/notion-webhook.service";
import { NotionWebhookRepository } from "./repository/notion-webhook.repository";

@Module({
  controllers: [NotionWebhookController],
  providers: [NotionWebhookService, NotionWebhookRepository],
})
export class NotionModule {}
