import { Module } from "@nestjs/common";
import { DashboardController } from "./controllers/dashboard.controller";
import { DashboardService } from "./applications/dashboard.service";
import { DashboardRepository } from "./repository/dashboard.repository";

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
})
export class DashboardModule {}
