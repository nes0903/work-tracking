import { Injectable } from "@nestjs/common";
import { handleNotionWebhook } from "../../../libs/notion-webhook";

@Injectable()
export class NotionWebhookRepository {
  handleNotionWebhook(rawBody: string, signature: string | null) {
    return handleNotionWebhook(rawBody, signature);
  }
}
