import { Injectable } from "@nestjs/common";
import { NotionWebhookRepository } from "../repository/notion-webhook.repository";

@Injectable()
export class NotionWebhookService {
  constructor(
    private readonly notionWebhookRepository: NotionWebhookRepository,
  ) {}

  handleWebhook(rawBody: string, signature: string | null) {
    return this.notionWebhookRepository.handleNotionWebhook(rawBody, signature);
  }
}
