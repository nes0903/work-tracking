import { Module } from "@nestjs/common";
import { FeedsController } from "./controllers/feeds.controller";
import { FeedsService } from "./applications/feeds.service";
import { FeedsRepository } from "./repository/feeds.repository";

@Module({
  controllers: [FeedsController],
  providers: [FeedsService, FeedsRepository],
})
export class FeedsModule {}
