import { Controller, Headers, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { LineWorksBotService } from "../applications/line-works-bot.service";

@Controller("api/line-works-bot")
export class LineWorksBotWebhookController {
  constructor(private readonly service: LineWorksBotService) {}

  @Post("callback")
  @HttpCode(200)
  async handleCallback(
    @Req() request: Request & { rawBody?: Buffer | string },
    @Res({ passthrough: true }) response: Response,
    @Headers("x-works-signature") signature?: string,
  ): Promise<Record<string, unknown>> {
    const rawBody =
      (Buffer.isBuffer(request.rawBody)
        ? request.rawBody.toString("utf8")
        : request.rawBody) ??
      (typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body ?? {}));

    const result = await this.service.handleWebhook(rawBody, signature ?? null);
    response.status(result.status);
    return result.body;
  }
}
