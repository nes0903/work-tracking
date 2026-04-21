import type { DatabaseSync } from "node:sqlite";
import {
  createEmptyDay,
  createId,
  emptyGithubFeed,
  emptyNotionFeed,
  normalizeState,
  type GithubEvent,
  type GithubFeed,
  type NotionFeed,
  type NotionUpdateItem,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type WorkDayMap,
} from "@libs/work-tracking";
import {
  getDatabase,
  getJsonSetting,
  setJsonSetting,
  withTransaction,
} from "@libs/sqlite-db";

interface NotionEventRow {
  event_id: string;
  event_type: string;
  page_url: string;
  page_link: string;
  title: string;
  edited_at: string | null;
  section_title: string | null;
  parent_title: string | null;
  editor_name: string | null;
  summary: string;
  received_at: string;
}

export interface NotionFeedPage {
  items: NotionUpdateItem[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  lastSyncedAt: string | null;
}

const NOTION_PER_PAGE_OPTIONS = [20, 50, 70, 100] as const;
const NOTION_DEFAULT_PER_PAGE = 20;

export function listNotionUpdateEvents(
  page: number,
  perPage: number,
): NotionFeedPage {
  const db = getDatabase();
  const safePerPage = (NOTION_PER_PAGE_OPTIONS as readonly number[]).includes(
    perPage,
  )
    ? perPage
    : NOTION_DEFAULT_PER_PAGE;
  const safePage = Math.max(1, Math.floor(page) || 1);
  const offset = (safePage - 1) * safePerPage;

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM notion_update_events`)
    .get() as { c: number } | undefined;
  const total = totalRow?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / safePerPage));

  const rows = db
    .prepare(
      `
        SELECT event_id, event_type, page_url, page_link, title, edited_at,
               section_title, parent_title, editor_name, summary, received_at
        FROM notion_update_events
        ORDER BY received_at DESC, event_id DESC
        LIMIT ? OFFSET ?
      `,
    )
    .all(safePerPage, offset) as unknown as NotionEventRow[];

  const items = rows.map(mapNotionEventRow);

  const lastSyncedRow = db
    .prepare(
      "SELECT MAX(received_at) AS last_synced_at FROM notion_update_events",
    )
    .get() as { last_synced_at: string | null } | undefined;

  return {
    items,
    pagination: {
      page: safePage,
      perPage: safePerPage,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    },
    lastSyncedAt: lastSyncedRow?.last_synced_at ?? null,
  };
}

function mapNotionEventRow(row: NotionEventRow): NotionUpdateItem {
  return {
    eventId: row.event_id,
    type: row.event_type,
    title: row.title,
    url: row.page_url,
    link: row.page_link,
    editedAt: row.edited_at,
    section: row.section_title ?? "",
    parent: row.parent_title,
    editor: row.editor_name,
    summary: row.summary,
  };
}

interface TaskRow {
  id: string;
  lineage_id: string;
  work_date: string;
  title: string;
  category: string;
  priority: TaskPriority;
  due_date: string;
  due_time: string | null;
  estimate_minutes: number;
  note: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  carryover_count: number;
  carried_from_date: string | null;
  completed_at: string | null;
}

interface WorkDayRow {
  work_date: string;
  notes: string;
  focus_minutes: number;
  timer_duration_minutes: number;
}

export interface DashboardState {
  days: WorkDayMap;
}

export interface CreateTaskInput {
  title: string;
  category: string;
  priority: TaskPriority;
  dueDate: string;
  dueTime?: string | null;
  estimate: number;
  note: string;
  createdByUserId?: string | null;
  /** 다중 담당자. 빈 배열이면 createdByUserId 로 fallback. */
  assigneeUserIds?: string[];
}

export function getDashboardState(dateKey: string): DashboardState {
  return withTransaction((db) => {
    prepareWorkDay(db, dateKey);
    return {
      days: selectDays(db),
    };
  });
}

export function importLegacyDays(
  days: WorkDayMap,
  dateKey: string,
): DashboardState {
  return withTransaction((db) => {
    const existingCount = db
      .prepare("SELECT COUNT(*) AS count FROM work_days")
      .get() as { count: number };

    if (existingCount.count === 0) {
      const normalized = normalizeState(days);

      for (const [workDate, day] of Object.entries(normalized)) {
        upsertWorkDay(
          db,
          workDate,
          day.notes,
          day.focusMinutes,
          day.timerDuration,
        );

        for (const task of day.tasks) {
          upsertTask(db, workDate, task);
        }
      }
    }

    prepareWorkDay(db, dateKey);
    return {
      days: selectDays(db),
    };
  });
}

export function createTaskForDate(
  dateKey: string,
  input: CreateTaskInput,
): DashboardState {
  return withTransaction((db) => {
    prepareWorkDay(db, dateKey);

    const timestamp = new Date().toISOString();
    const lineageId = createId();

    const createdBy = input.createdByUserId ?? null;
    const assigneeIds = resolveAssigneeIds(input.assigneeUserIds, createdBy);
    // 하위호환: 레거시 컬럼에 첫 번째 담당자 기록 (차후 제거 예정)
    const primaryAssignee = assigneeIds[0] ?? createdBy;

    db.prepare(
      `
        INSERT INTO tasks (
          id, lineage_id, work_date, title, category, priority, due_date, due_time,
          estimate_minutes, note, status, sort_order, carryover_count,
          carried_from_date, created_at, updated_at, completed_at,
          created_by_user_id, assignee_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo', 0, 0, NULL, ?, ?, NULL, ?, ?)
      `,
    ).run(
      lineageId,
      lineageId,
      dateKey,
      input.title.trim(),
      input.category.trim(),
      input.priority,
      input.dueDate || dateKey,
      normalizeDueTime(input.dueTime),
      Math.max(0, Number(input.estimate) || 0),
      input.note.trim(),
      timestamp,
      timestamp,
      createdBy,
      primaryAssignee,
    );

    replaceTaskAssignees(db, lineageId, assigneeIds);

    touchWorkDay(db, dateKey);
    return {
      days: selectDays(db),
    };
  });
}

export interface UpdateTaskInput {
  title?: string;
  category?: string;
  priority?: TaskPriority;
  dueDate?: string;
  dueTime?: string | null;
  note?: string;
  /** 전체 교체 시맨틱. 전달되면 기존 담당자 모두 제거 후 재설정. */
  assigneeUserIds?: string[];
}

export function updateTaskForDate(
  dateKey: string,
  taskId: string,
  patch: UpdateTaskInput,
): DashboardState {
  return withTransaction((db) => {
    prepareWorkDay(db, dateKey);

    const sets: string[] = [];
    const args: (string | number | null)[] = [];

    if (patch.title !== undefined) {
      sets.push("title = ?");
      args.push(String(patch.title).trim());
    }
    if (patch.category !== undefined) {
      sets.push("category = ?");
      args.push(String(patch.category).trim());
    }
    if (patch.priority !== undefined) {
      sets.push("priority = ?");
      args.push(patch.priority);
    }
    if (patch.dueDate !== undefined) {
      sets.push("due_date = ?");
      args.push(patch.dueDate || dateKey);
    }
    if (patch.dueTime !== undefined) {
      sets.push("due_time = ?");
      args.push(normalizeDueTime(patch.dueTime));
    }
    if (patch.note !== undefined) {
      sets.push("note = ?");
      args.push(String(patch.note));
    }

    if (patch.assigneeUserIds !== undefined) {
      const ids = resolveAssigneeIds(patch.assigneeUserIds, null);
      // 레거시 컬럼에도 first assignee 를 반영해 호환 유지
      sets.push("assignee_user_id = ?");
      args.push(ids[0] ?? null);
    }

    if (sets.length > 0) {
      sets.push("updated_at = ?");
      args.push(new Date().toISOString());

      db.prepare(
        `UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND work_date = ?`,
      ).run(...args, taskId, dateKey);

      touchWorkDay(db, dateKey);
    }

    if (patch.assigneeUserIds !== undefined) {
      replaceTaskAssignees(
        db,
        taskId,
        resolveAssigneeIds(patch.assigneeUserIds, null),
      );
    }

    return {
      days: selectDays(db),
    };
  });
}

export function updateTaskStatusForDate(
  dateKey: string,
  taskId: string,
  status: TaskStatus,
): DashboardState {
  return withTransaction((db) => {
    prepareWorkDay(db, dateKey);
    const timestamp = new Date().toISOString();

    db.prepare(
      `
        UPDATE tasks
        SET status = ?, updated_at = ?, completed_at = ?
        WHERE id = ? AND work_date = ?
      `,
    ).run(
      status,
      timestamp,
      status === "done" ? timestamp : null,
      taskId,
      dateKey,
    );

    touchWorkDay(db, dateKey);
    return {
      days: selectDays(db),
    };
  });
}

export function deleteTaskForDate(
  dateKey: string,
  taskId: string,
): DashboardState {
  return withTransaction((db) => {
    prepareWorkDay(db, dateKey);
    db.prepare("DELETE FROM tasks WHERE id = ? AND work_date = ?").run(
      taskId,
      dateKey,
    );
    touchWorkDay(db, dateKey);

    return {
      days: selectDays(db),
    };
  });
}

export function clearCompletedForDate(dateKey: string): DashboardState {
  return withTransaction((db) => {
    prepareWorkDay(db, dateKey);
    db.prepare("DELETE FROM tasks WHERE work_date = ? AND status = 'done'").run(
      dateKey,
    );
    touchWorkDay(db, dateKey);

    return {
      days: selectDays(db),
    };
  });
}

export function updateNotesForDate(
  dateKey: string,
  notes: string,
): DashboardState {
  return withTransaction((db) => {
    prepareWorkDay(db, dateKey);
    db.prepare(
      `
        UPDATE work_days
        SET notes = ?, updated_at = datetime('now')
        WHERE work_date = ?
      `,
    ).run(notes, dateKey);

    return {
      days: selectDays(db),
    };
  });
}

export function updateTimerDurationForDate(
  dateKey: string,
  timerDuration: number,
): DashboardState {
  return withTransaction((db) => {
    prepareWorkDay(db, dateKey);
    db.prepare(
      `
        UPDATE work_days
        SET timer_duration_minutes = ?, updated_at = datetime('now')
        WHERE work_date = ?
      `,
    ).run(timerDuration, dateKey);

    return {
      days: selectDays(db),
    };
  });
}

export function recordFocusSessionForDate(
  dateKey: string,
  durationMinutes: number,
): DashboardState {
  return withTransaction((db) => {
    prepareWorkDay(db, dateKey);
    const timestamp = new Date().toISOString();

    db.prepare(
      `
        INSERT INTO focus_sessions (
          id, work_date, duration_minutes, started_at, ended_at, source, created_at
        )
        VALUES (?, ?, ?, NULL, ?, 'timer', datetime('now'))
      `,
    ).run(createId(), dateKey, durationMinutes, timestamp);

    db.prepare(
      `
        UPDATE work_days
        SET focus_minutes = focus_minutes + ?, updated_at = datetime('now')
        WHERE work_date = ?
      `,
    ).run(durationMinutes, dateKey);

    return {
      days: selectDays(db),
    };
  });
}

export function getNotionFeedFromStore() {
  const payload = getJsonSetting<NotionFeed>("notion_feed_payload");
  return payload ?? emptyNotionFeed();
}

export function setNotionFeedInStore(feed: NotionFeed) {
  setJsonSetting("notion_feed_payload", feed);
}

export function getGithubFeedFromStore() {
  const payload = getJsonSetting<GithubFeed>("github_feed_payload");
  return payload ?? emptyGithubFeed();
}

export function setGithubFeedInStore(feed: GithubFeed) {
  setJsonSetting("github_feed_payload", feed);
}

function selectDays(db: DatabaseSync): WorkDayMap {
  const workDays = db
    .prepare(
      `
        SELECT work_date, notes, focus_minutes, timer_duration_minutes
        FROM work_days
        ORDER BY work_date ASC
      `,
    )
    .all() as unknown as WorkDayRow[];

  const tasks = db
    .prepare(
      `
        SELECT
          id, lineage_id, work_date, title, category, priority, due_date, due_time,
          estimate_minutes, note, status, created_at, updated_at,
          carryover_count, carried_from_date, completed_at
        FROM tasks
        ORDER BY work_date ASC, datetime(created_at) ASC, id ASC
      `,
    )
    .all() as unknown as TaskRow[];

  const days = Object.fromEntries(
    workDays.map((row) => [
      row.work_date,
      {
        tasks: [],
        notes: row.notes,
        focusMinutes: row.focus_minutes,
        timerDuration: row.timer_duration_minutes,
      },
    ]),
  ) as WorkDayMap;

  const assigneeMap = listAssigneesForTasks(
    db,
    tasks.map((row) => row.id),
  );

  for (const row of tasks) {
    if (!days[row.work_date]) {
      days[row.work_date] = createEmptyDay();
    }
    const mapped = mapTaskRow(row);
    mapped.assignees = assigneeMap.get(row.id) ?? [];
    days[row.work_date].tasks.push(mapped);
  }

  return days;
}

function prepareWorkDay(db: DatabaseSync, dateKey: string) {
  // 조회/수정 요청이 task row 자체를 이동시키면 참조와 이력이 깨진다.
  // work_day row 만 보장하고 task 는 그대로 둔다.
  ensureWorkDay(db, dateKey);
}

function ensureWorkDay(db: DatabaseSync, dateKey: string) {
  db.prepare(
    `
      INSERT INTO work_days (work_date, notes, focus_minutes, timer_duration_minutes)
      VALUES (?, '', 0, 25)
      ON CONFLICT(work_date) DO NOTHING
    `,
  ).run(dateKey);
}

function touchWorkDay(db: DatabaseSync, dateKey: string) {
  db.prepare(
    `
      UPDATE work_days
      SET updated_at = datetime('now')
      WHERE work_date = ?
    `,
  ).run(dateKey);
}

function upsertWorkDay(
  db: DatabaseSync,
  dateKey: string,
  notes: string,
  focusMinutes: number,
  timerDuration: number,
) {
  db.prepare(
    `
      INSERT INTO work_days (
        work_date, notes, focus_minutes, timer_duration_minutes, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(work_date) DO UPDATE SET
        notes = excluded.notes,
        focus_minutes = excluded.focus_minutes,
        timer_duration_minutes = excluded.timer_duration_minutes,
        updated_at = excluded.updated_at
    `,
  ).run(dateKey, notes, focusMinutes, timerDuration);
}

function upsertTask(db: DatabaseSync, dateKey: string, task: Task) {
  db.prepare(
    `
      INSERT INTO tasks (
        id, lineage_id, work_date, title, category, priority, due_date, due_time,
        estimate_minutes, note, status, sort_order, carryover_count,
        carried_from_date, created_at, updated_at, completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        lineage_id = excluded.lineage_id,
        work_date = excluded.work_date,
        title = excluded.title,
        category = excluded.category,
        priority = excluded.priority,
        due_date = excluded.due_date,
        due_time = excluded.due_time,
        estimate_minutes = excluded.estimate_minutes,
        note = excluded.note,
        status = excluded.status,
        carryover_count = excluded.carryover_count,
        carried_from_date = excluded.carried_from_date,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at
    `,
  ).run(
    task.id,
    task.lineageId,
    dateKey,
    task.title,
    task.category,
    task.priority,
    task.dueDate,
    task.dueTime ?? null,
    task.estimate,
    task.note,
    task.status,
    task.carryoverCount,
    task.carriedFromDate,
    task.createdAt,
    task.updatedAt,
    task.completedAt,
  );

  // assignees 가 제공된 경우에만 교체. (import 경로 호환)
  if (Array.isArray(task.assignees) && task.assignees.length > 0) {
    replaceTaskAssignees(
      db,
      task.id,
      task.assignees.map((a) => a.userId),
    );
  }
}

function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    lineageId: row.lineage_id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    dueDate: row.due_date,
    dueTime: row.due_time,
    estimate: row.estimate_minutes,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    carryoverCount: row.carryover_count,
    carriedFromDate: row.carried_from_date,
    completedAt: row.completed_at,
    assignees: [],
  };
}

function normalizeDueTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
}

function resolveAssigneeIds(
  ids: string[] | undefined,
  fallbackUserId: string | null,
): string[] {
  if (Array.isArray(ids)) {
    const cleaned = Array.from(
      new Set(
        ids
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0),
      ),
    );
    if (cleaned.length > 0) return cleaned;
  }
  if (fallbackUserId && fallbackUserId.trim()) {
    return [fallbackUserId.trim()];
  }
  return [];
}

/**
 * task_assignees 를 주어진 userIds 로 교체한다.
 * 호출자는 트랜잭션 안에서 호출할 것.
 */
function replaceTaskAssignees(
  db: DatabaseSync,
  taskId: string,
  userIds: string[],
): void {
  db.prepare(`DELETE FROM task_assignees WHERE task_id = ?`).run(taskId);
  if (userIds.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO task_assignees (task_id, user_id, sort_order) VALUES (?, ?, ?)`,
  );
  for (let i = 0; i < userIds.length; i++) {
    stmt.run(taskId, userIds[i], i);
  }
}

function listAssigneesForTasks(
  db: DatabaseSync,
  taskIds: string[],
): Map<string, { userId: string; userName: string | null }[]> {
  const result = new Map<
    string,
    { userId: string; userName: string | null }[]
  >();
  if (taskIds.length === 0) return result;
  const placeholders = taskIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
        SELECT ta.task_id,
               ta.user_id,
               u.user_name,
               ta.sort_order
          FROM task_assignees ta
     LEFT JOIN users u ON u.user_id = ta.user_id
         WHERE ta.task_id IN (${placeholders})
      ORDER BY ta.task_id ASC, ta.sort_order ASC, ta.user_id ASC
      `,
    )
    .all(...taskIds) as Array<{
    task_id: string;
    user_id: string;
    user_name: string | null;
    sort_order: number;
  }>;
  for (const row of rows) {
    const list = result.get(row.task_id) ?? [];
    list.push({ userId: row.user_id, userName: row.user_name });
    result.set(row.task_id, list);
  }
  return result;
}
