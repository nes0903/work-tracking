import { Controller, Headers, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { GithubWebhookService } from "../applications/github-webhook.service";

@Controller("api/github")
export class GithubWebhookController {
  constructor(private readonly githubWebhookService: GithubWebhookService) {}

  @Post("webhook")
  @HttpCode(200)
  async handleWebhook(
    @Req() request: Request & { rawBody?: string | Buffer },
    @Res({ passthrough: true }) response: Response,
    @Headers("x-hub-signature-256") signature?: string,
    @Headers("x-github-event") event?: string,
    @Headers("x-github-delivery") deliveryId?: string,
  ): Promise<Record<string, unknown>> {
    const rawBody =
      (Buffer.isBuffer(request.rawBody)
        ? request.rawBody.toString("utf8")
        : request.rawBody) ??
      (typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body ?? {}));

    const result = await this.githubWebhookService.handleWebhook(rawBody, {
      signature: signature ?? null,
      event: event ?? null,
      deliveryId: deliveryId ?? null,
    });

    response.status(result.status);
    return result.body;
  }
}
