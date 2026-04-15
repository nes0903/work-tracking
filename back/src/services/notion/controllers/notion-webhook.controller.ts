import { Controller, Headers, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { NotionWebhookService } from "../applications/notion-webhook.service";

@Controller("api/notion")
export class NotionWebhookController {
  constructor(private readonly notionWebhookService: NotionWebhookService) {}

  @Post("webhook")
  @HttpCode(200)
  async handleWebhook(
    @Req() request: Request & { rawBody?: string },
    @Res({ passthrough: true }) response: Response,
    @Headers("x-notion-signature") signature?: string,
  ): Promise<Record<string, unknown>> {
    const rawBody =
      (Buffer.isBuffer(request.rawBody)
        ? request.rawBody.toString("utf8")
        : request.rawBody) ??
      (typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body ?? {}));
    const result = await this.notionWebhookService.handleWebhook(
      rawBody,
      signature ?? null,
    );

    response.status(result.status);
    return result.body;
  }
}
