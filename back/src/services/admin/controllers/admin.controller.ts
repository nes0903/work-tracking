import {
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "@common/auth.guard";
import { getDatabase } from "@libs/sqlite-db";

@Controller("api/admin")
@UseGuards(AuthGuard)
export class AdminController {
  /**
   * 기존 tasks 행 중 created_by_user_id / assignee_user_id 가 null 인 것들을
   * 호출자(세션 유저)로 1회 백필. 여러 번 호출해도 이미 채워진 건 건드리지 않음.
   */
  @Post("backfill-tasks")
  backfillTasks(@Req() req: Request) {
    if (!req.auth) {
      throw new HttpException(
        { ok: false, error: "Unauthorized" },
        HttpStatus.UNAUTHORIZED,
      );
    }
    const db = getDatabase();
    const userId = req.auth.userId;

    const created = db
      .prepare(
        `UPDATE tasks SET created_by_user_id = ? WHERE created_by_user_id IS NULL`,
      )
      .run(userId);
    const assigned = db
      .prepare(
        `UPDATE tasks SET assignee_user_id = ? WHERE assignee_user_id IS NULL`,
      )
      .run(userId);

    return {
      ok: true,
      updatedCreatedBy: created.changes,
      updatedAssignee: assigned.changes,
      userId,
    };
  }
}
