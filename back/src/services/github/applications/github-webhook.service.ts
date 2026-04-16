import { Injectable } from "@nestjs/common";
import type { GithubWebhookHeaders } from "@libs/github-webhook";
import { GithubWebhookRepository } from "../repository/github-webhook.repository";

@Injectable()
export class GithubWebhookService {
  constructor(
    private readonly githubWebhookRepository: GithubWebhookRepository,
  ) {}

  handleWebhook(rawBody: string, headers: GithubWebhookHeaders) {
    return this.githubWebhookRepository.handleGithubWebhook(rawBody, headers);
  }
}
