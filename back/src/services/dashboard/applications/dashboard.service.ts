import { Injectable } from "@nestjs/common";
import { normalizeState, type TaskStatus } from "@libs/work-tracking";
import { DashboardRepository } from "../repository/dashboard.repository";

/**
 * payload 에서 담당자 id 목록을 뽑는다.
 * create(task 객체) / update(patch 객체) 양쪽에서 재사용.
 * - `assigneeUserIds` 배열이 오면 검증해서 반환
 * - `assigneeUserId` 단일값도 하위호환으로 받음 (string | null)
 * - 해당 필드 자체가 없으면 create 에서는 빈 배열, update 에서는 null 을 의미하는 빈 배열을 반환하기 위해
 *   create 용 overload 는 항상 string[] 를, update 용 overload 는 null|string[] 를 반환해야 한다.
 *   여기서는 간단히 "명시적으로 전달되었는가" 여부를 null 반환으로 구별.
 */
function extractAssigneeIds(source: unknown): string[] {
  if (!source || typeof source !== "object") return [];
  const obj = source as Record<string, unknown>;
  const list = obj.assigneeUserIds;
  if (Array.isArray(list)) {
    return list
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  // 하위호환: 단일값
  if (typeof obj.assigneeUserId === "string" && obj.assigneeUserId.trim()) {
    return [obj.assigneeUserId.trim()];
  }
  return [];
}

function hasAssigneeField(source: unknown): boolean {
  if (!source || typeof source !== "object") return false;
  const obj = source as Record<string, unknown>;
  return "assigneeUserIds" in obj || "assigneeUserId" in obj;
}

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  getDashboardState(date: string) {
    return this.dashboardRepository.getDashboardState(date);
  }

  handleAction(payload: any, sessionUserId?: string | null) {
    const action = payload?.action as string | undefined;
    const date = payload?.date as string | undefined;

    if (!date) {
      throw new Error("date is required");
    }

    switch (action) {
      case "importLegacyDays":
        return this.dashboardRepository.importLegacyDays(
          normalizeState(payload?.days ?? {}),
          date,
        );
      case "createTask": {
        const rawDueTime = payload?.task?.dueTime;
        const assigneeUserIds = extractAssigneeIds(payload?.task);
        return this.dashboardRepository.createTask(date, {
          title: String(payload?.task?.title ?? ""),
          category: String(payload?.task?.category ?? ""),
          priority: payload?.task?.priority,
          dueDate: String(payload?.task?.dueDate ?? date),
          dueTime: typeof rawDueTime === "string" && rawDueTime ? rawDueTime : null,
          estimate: Number(payload?.task?.estimate ?? 0),
          note: String(payload?.task?.note ?? ""),
          createdByUserId: sessionUserId ?? null,
          assigneeUserIds:
            assigneeUserIds.length > 0
              ? assigneeUserIds
              : sessionUserId
                ? [sessionUserId]
                : [],
        });
      }
      case "updateTaskStatus":
        return this.dashboardRepository.updateTaskStatus(
          date,
          String(payload?.taskId ?? ""),
          payload?.status as TaskStatus,
        );
      case "updateTask": {
        const patch = (payload?.patch ?? {}) as Record<string, unknown>;
        const cleaned: Parameters<
          typeof this.dashboardRepository.updateTask
        >[2] = {};
        if (typeof patch.title === "string") cleaned.title = patch.title;
        if (typeof patch.category === "string") cleaned.category = patch.category;
        if (
          patch.priority === "high" ||
          patch.priority === "medium" ||
          patch.priority === "low"
        ) {
          cleaned.priority = patch.priority;
        }
        if (typeof patch.dueDate === "string") cleaned.dueDate = patch.dueDate;
        if (patch.dueTime === null) cleaned.dueTime = null;
        else if (typeof patch.dueTime === "string") cleaned.dueTime = patch.dueTime;
        if (typeof patch.note === "string") cleaned.note = patch.note;
        if (hasAssigneeField(patch)) {
          cleaned.assigneeUserIds = extractAssigneeIds(patch);
        }
        return this.dashboardRepository.updateTask(
          date,
          String(payload?.taskId ?? ""),
          cleaned,
        );
      }
      case "deleteTask":
        return this.dashboardRepository.deleteTask(
          date,
          String(payload?.taskId ?? ""),
        );
      case "clearCompleted":
        return this.dashboardRepository.clearCompleted(date);
      case "updateNotes":
        return this.dashboardRepository.updateNotes(
          date,
          String(payload?.notes ?? ""),
        );
      case "updateTimerDuration":
        return this.dashboardRepository.updateTimerDuration(
          date,
          Number(payload?.timerDuration ?? 25),
        );
      case "recordFocusSession":
        return this.dashboardRepository.recordFocusSession(
          date,
          Number(payload?.durationMinutes ?? 0),
        );
      default:
        throw new Error("unsupported action");
    }
  }
}
