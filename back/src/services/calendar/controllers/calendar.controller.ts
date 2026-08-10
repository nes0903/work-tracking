import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../../../common/auth.guard";
import { queryCalendar } from "../../../libs/calendar-db";

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

@Controller("api/calendar")
@UseGuards(AuthGuard)
export class CalendarController {
  @Get()
  async list(
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
  ) {
    if (!isDateKey(from) || !isDateKey(to)) {
      return { ok: false, error: "from/to must be YYYY-MM-DD" };
    }
    const result = await queryCalendar(from, to);
    return { ok: true, ...result };
  }
}
