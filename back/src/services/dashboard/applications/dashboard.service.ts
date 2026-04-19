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
        return this.dashboardRepository.createTask(date, {
          title: String(payload?.task?.title ?? ""),
          category: String(payload?.task?.category ?? ""),
          priority: payload?.task?.priority,
          dueDate: String(payload?.task?.dueDate ?? date),
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
