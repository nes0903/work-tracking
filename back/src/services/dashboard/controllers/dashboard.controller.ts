import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from "@nestjs/common";
import { DashboardService } from "../applications/dashboard.service";

@Controller("api/dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getDashboard(@Query("date") date?: string) {
    if (!date) {
      throw new HttpException(
        { ok: false, error: "date query is required" },
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      ok: true,
      ...this.dashboardService.getDashboardState(date),
    };
  }

  @Post()
  handleDashboardAction(@Body() payload: any) {
    try {
      return {
        ok: true,
        ...this.dashboardService.handleAction(payload),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error";
      throw new HttpException(
        { ok: false, error: message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
