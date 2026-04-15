import { NextResponse, type NextRequest } from "next/server";
import {
  clearCompletedForDate,
  createTaskForDate,
  getDashboardState,
  importLegacyDays,
  recordFocusSessionForDate,
  updateNotesForDate,
  updateTaskStatusForDate,
  updateTimerDurationForDate,
  deleteTaskForDate,
} from "@/lib/dashboard-db";
import { normalizeState, type TaskStatus } from "@/lib/work-tracking";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");

  if (!date) {
    return NextResponse.json({ ok: false, error: "date query is required" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    ...getDashboardState(date),
  });
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const action = payload?.action as string | undefined;
  const date = payload?.date as string | undefined;

  try {
    switch (action) {
      case "importLegacyDays": {
        if (!date) {
          return badRequest("date is required");
        }

        return NextResponse.json({
          ok: true,
          ...importLegacyDays(normalizeState(payload?.days ?? {}), date),
        });
      }
      case "createTask": {
        if (!date) {
          return badRequest("date is required");
        }

        return NextResponse.json({
          ok: true,
          ...createTaskForDate(date, {
            title: String(payload?.task?.title ?? ""),
            category: String(payload?.task?.category ?? ""),
            priority: payload?.task?.priority,
            dueDate: String(payload?.task?.dueDate ?? date),
            estimate: Number(payload?.task?.estimate ?? 0),
            note: String(payload?.task?.note ?? ""),
          }),
        });
      }
      case "updateTaskStatus": {
        if (!date || !payload?.taskId || !payload?.status) {
          return badRequest("date, taskId, status are required");
        }

        return NextResponse.json({
          ok: true,
          ...updateTaskStatusForDate(date, String(payload.taskId), payload.status as TaskStatus),
        });
      }
      case "deleteTask": {
        if (!date || !payload?.taskId) {
          return badRequest("date and taskId are required");
        }

        return NextResponse.json({
          ok: true,
          ...deleteTaskForDate(date, String(payload.taskId)),
        });
      }
      case "clearCompleted": {
        if (!date) {
          return badRequest("date is required");
        }

        return NextResponse.json({
          ok: true,
          ...clearCompletedForDate(date),
        });
      }
      case "updateNotes": {
        if (!date) {
          return badRequest("date is required");
        }

        return NextResponse.json({
          ok: true,
          ...updateNotesForDate(date, String(payload?.notes ?? "")),
        });
      }
      case "updateTimerDuration": {
        if (!date) {
          return badRequest("date is required");
        }

        return NextResponse.json({
          ok: true,
          ...updateTimerDurationForDate(date, Number(payload?.timerDuration ?? 25)),
        });
      }
      case "recordFocusSession": {
        if (!date) {
          return badRequest("date is required");
        }

        return NextResponse.json({
          ok: true,
          ...recordFocusSessionForDate(date, Number(payload?.durationMinutes ?? 0)),
        });
      }
      default:
        return badRequest("unsupported action");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}
