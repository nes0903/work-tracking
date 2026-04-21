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
   * 기존 tasks 행 중 created_by_user_id 가 null 인 것, 그리고
   * task_assignees 에 담당자가 하나도 없는 task 에 대해 호출자(세션 유저)로 1회 백필.
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

    // 레거시 컬럼 호환용 (구버전 코드 참조하는 경우에도 일관성 유지)
    db.prepare(
      `UPDATE tasks SET assignee_user_id = ? WHERE assignee_user_id IS NULL`,
    ).run(userId);

    // task_assignees 에 아예 없는 task 들에 세션 유저를 1명 추가
    const assigned = db
      .prepare(
        `
          INSERT OR IGNORE INTO task_assignees (task_id, user_id, sort_order)
          SELECT t.id, ?, 0
            FROM tasks t
           WHERE NOT EXISTS (
             SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id
           )
        `,
      )
      .run(userId);

    return {
      ok: true,
      updatedCreatedBy: created.changes,
      addedAssignees: assigned.changes,
      userId,
    };
  }
}
