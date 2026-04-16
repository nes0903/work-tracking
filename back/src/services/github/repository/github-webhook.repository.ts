import { Injectable } from "@nestjs/common";
import {
  handleGithubWebhook,
  type GithubWebhookHeaders,
} from "@libs/github-webhook";

@Injectable()
export class GithubWebhookRepository {
  handleGithubWebhook(rawBody: string, headers: GithubWebhookHeaders) {
    return handleGithubWebhook(rawBody, headers);
  }
}
