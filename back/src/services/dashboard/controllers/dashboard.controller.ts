import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "@common/auth.guard";
import { DashboardService } from "../applications/dashboard.service";

@Controller("api/dashboard")
@UseGuards(AuthGuard)
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
  handleDashboardAction(@Body() payload: any, @Req() req: Request) {
    try {
      return {
        ok: true,
        ...this.dashboardService.handleAction(payload, req.auth?.userId ?? null),
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
