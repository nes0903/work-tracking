import { Injectable } from "@nestjs/common";
import { normalizeState, type TaskStatus } from "@libs/work-tracking";
import { DashboardRepository } from "../repository/dashboard.repository";

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
        const assigneeFromPayload = payload?.task?.assigneeUserId;
        const rawDueTime = payload?.task?.dueTime;
        return this.dashboardRepository.createTask(date, {
          title: String(payload?.task?.title ?? ""),
          category: String(payload?.task?.category ?? ""),
          priority: payload?.task?.priority,
          dueDate: String(payload?.task?.dueDate ?? date),
          dueTime: typeof rawDueTime === "string" && rawDueTime ? rawDueTime : null,
          estimate: Number(payload?.task?.estimate ?? 0),
          note: String(payload?.task?.note ?? ""),
          createdByUserId: sessionUserId ?? null,
          assigneeUserId:
            typeof assigneeFromPayload === "string" && assigneeFromPayload
              ? assigneeFromPayload
              : sessionUserId ?? null,
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
        if (patch.assigneeUserId === null) cleaned.assigneeUserId = null;
        else if (typeof patch.assigneeUserId === "string") {
          cleaned.assigneeUserId = patch.assigneeUserId;
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
