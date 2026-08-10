import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { CommonModule } from "./common/common.module";
import { ConfigsModule } from "./configs";
import { DatabasesModule } from "./databases";
import generalsModule from "./services/generals";

@Module({
  imports: [ConfigsModule, DatabasesModule, CommonModule, ...generalsModule],
  controllers: [HealthController],
})
export class AppModule {}
