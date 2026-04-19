import { Module } from "@nestjs/common";
import { CalendarController } from "./controllers/calendar.controller";

@Module({ controllers: [CalendarController] })
export class CalendarModule {}
