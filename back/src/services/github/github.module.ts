import { Module } from "@nestjs/common";
import { GithubWebhookController } from "./controllers/github-webhook.controller";
import { GithubWebhookService } from "./applications/github-webhook.service";
import { GithubWebhookRepository } from "./repository/github-webhook.repository";

@Module({
  controllers: [GithubWebhookController],
  providers: [GithubWebhookService, GithubWebhookRepository],
})
export class GithubModule {}
