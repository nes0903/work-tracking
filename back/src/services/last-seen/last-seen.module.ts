import { Module } from "@nestjs/common";
import { LastSeenController } from "./controllers/last-seen.controller";

@Module({
  controllers: [LastSeenController],
})
export class LastSeenModule {}
