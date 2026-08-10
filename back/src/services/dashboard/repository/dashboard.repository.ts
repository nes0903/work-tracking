import { Injectable } from "@nestjs/common";
import {
  clearCompletedForDate,
  createTaskForDate,
  deleteTaskForDate,
  getDashboardState,
  importLegacyDays,
  recordFocusSessionForDate,
  updateNotesForDate,
  updateTaskForDate,
  updateTaskStatusForDate,
  updateTimerDurationForDate,
  type CreateTaskInput,
  type DashboardState,
  type UpdateTaskInput,
} from "../../../libs/dashboard-db";
import { type TaskStatus, type WorkDayMap } from "../../../libs/work-tracking";

@Injectable()
export class DashboardRepository {
  getDashboardState(date: string): Promise<DashboardState> {
    return getDashboardState(date);
  }

  importLegacyDays(days: WorkDayMap, date: string): Promise<DashboardState> {
    return importLegacyDays(days, date);
  }

  createTask(date: string, task: CreateTaskInput): Promise<DashboardState> {
    return createTaskForDate(date, task);
  }

  updateTaskStatus(
    date: string,
    taskId: string,
    status: TaskStatus,
  ): Promise<DashboardState> {
    return updateTaskStatusForDate(date, taskId, status);
  }

  updateTask(
    date: string,
    taskId: string,
    patch: UpdateTaskInput,
  ): Promise<DashboardState> {
    return updateTaskForDate(date, taskId, patch);
  }

  deleteTask(date: string, taskId: string): Promise<DashboardState> {
    return deleteTaskForDate(date, taskId);
  }

  clearCompleted(date: string): Promise<DashboardState> {
    return clearCompletedForDate(date);
  }

  updateNotes(date: string, notes: string): Promise<DashboardState> {
    return updateNotesForDate(date, notes);
  }

  updateTimerDuration(
    date: string,
    timerDuration: number,
  ): Promise<DashboardState> {
    return updateTimerDurationForDate(date, timerDuration);
  }

  recordFocusSession(
    date: string,
    durationMinutes: number,
  ): Promise<DashboardState> {
    return recordFocusSessionForDate(date, durationMinutes);
  }
}
