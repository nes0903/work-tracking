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
import { getDatabase, type DatabaseClient } from "@libs/postgres-db";

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
const NOTION_NEW_TTL_MS = 24 * 60 * 60 * 1000;

export async function listNotionUpdateEvents(
  page: number,
  perPage: number,
): Promise<NotionFeedPage> {
  const db = getDatabase();
  const safePerPage = (NOTION_PER_PAGE_OPTIONS as readonly number[]).includes(
    perPage,
  )
    ? perPage
    : NOTION_DEFAULT_PER_PAGE;
  const safePage = Math.max(1, Math.floor(page) || 1);
  const offset = (safePage - 1) * safePerPage;

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS c FROM notion_update_events`)
    .get();
  const total = Number(totalRow?.c ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / safePerPage));

  const rows = await db
    .prepare(
      `
        SELECT event_id, event_type, page_url, page_link, title, edited_at,
               section_title, parent_title, editor_name, summary, received_at
        FROM notion_update_events
        ORDER BY received_at DESC, event_id DESC
        LIMIT ? OFFSET ?
      `,
    )
    .all(safePerPage, offset);

  const items = rows.map(mapNotionEventRow);

  const lastSyncedRow = await db
    .prepare(
      "SELECT MAX(received_at) AS last_synced_at FROM notion_update_events",
    )
    .get();

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

export async function countNewNotionUpdateEvents(
  userId: string,
): Promise<number> {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - NOTION_NEW_TTL_MS).toISOString();
  const row = await db
    .prepare(
      `
        SELECT COUNT(*) AS c
        FROM notion_update_events e
        LEFT JOIN user_notion_read r
          ON r.user_id = ? AND r.event_id = e.event_id
        LEFT JOIN user_last_seen s
          ON s.user_id = ? AND s.source = 'notion'
        WHERE e.edited_at IS NOT NULL
          AND e.edited_at >= ?
          AND r.event_id IS NULL
          AND (
            s.last_seen_at IS NULL
            OR e.edited_at > s.last_seen_at
          )
      `,
    )
    .get(userId, userId, cutoff);

  return Number(row?.c ?? 0);
}

interface TaskRow {
  id: string;
  parent_task_id: string | null;
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
  completed_at: string | null;
}

interface WorkDayRow {
  work_date: string;
  notes: string;
  focus_minutes: number;
  timer_duration_minutes: number;
}

const MAX_TASK_DEPTH = 3;

export interface DashboardState {
  days: WorkDayMap;
}

export interface CreateTaskInput {
  title: string;
  parentTaskId?: string | null;
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

export async function getDashboardState(
  dateKey: string,
): Promise<DashboardState> {
  return getDatabase().transaction(async (db) => {
    await prepareWorkDay(db, dateKey);
    return {
      days: await selectDays(db),
    };
  });
}

export async function importLegacyDays(
  days: WorkDayMap,
  dateKey: string,
): Promise<DashboardState> {
  return getDatabase().transaction(async (db) => {
    const existingCount = (await db
      .prepare("SELECT COUNT(*) AS count FROM work_days")
      .get()) as { count: number | string };

    if (Number(existingCount.count) === 0) {
      const normalized = normalizeState(days);

      for (const [workDate, day] of Object.entries(normalized)) {
        await upsertWorkDay(
          db,
          workDate,
          day.notes,
          day.focusMinutes,
          day.timerDuration,
        );

        for (const task of day.tasks) {
          await upsertTask(db, workDate, task);
        }
      }
    }

    await prepareWorkDay(db, dateKey);
    return {
      days: await selectDays(db),
    };
  });
}

interface TaskHierarchyNode {
  id: string;
  parentTaskId: string | null;
}

async function listTaskHierarchyNodes(
  db: DatabaseClient,
): Promise<TaskHierarchyNode[]> {
  return (await db.prepare(`SELECT id, parent_task_id FROM tasks`).all()).map(
    (row) => ({
      id: row.id,
      parentTaskId: row.parent_task_id ?? null,
    }),
  );
}

function buildParentMap(
  nodes: TaskHierarchyNode[],
): Map<string, string | null> {
  return new Map(nodes.map((node) => [node.id, node.parentTaskId]));
}

function buildChildrenMap(nodes: TaskHierarchyNode[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentTaskId) continue;
    const list = result.get(node.parentTaskId) ?? [];
    list.push(node.id);
    result.set(node.parentTaskId, list);
  }
  return result;
}

function getTaskDepth(
  taskId: string,
  parentById: Map<string, string | null>,
  cache = new Map<string, number>(),
  visiting = new Set<string>(),
): number {
  const cached = cache.get(taskId);
  if (cached) return cached;
  if (visiting.has(taskId)) {
    throw new Error("태스크 위계에 순환이 있습니다.");
  }
  visiting.add(taskId);
  const parentId = parentById.get(taskId) ?? null;
  const depth = parentId
    ? getTaskDepth(parentId, parentById, cache, visiting) + 1
    : 1;
  visiting.delete(taskId);
  cache.set(taskId, depth);
  return depth;
}

function getSubtreeHeight(
  taskId: string,
  childrenById: Map<string, string[]>,
  cache = new Map<string, number>(),
): number {
  const cached = cache.get(taskId);
  if (cached) return cached;
  const children = childrenById.get(taskId) ?? [];
  const height =
    children.length === 0
      ? 1
      : 1 +
        Math.max(
          ...children.map((childId) =>
            getSubtreeHeight(childId, childrenById, cache),
          ),
        );
  cache.set(taskId, height);
  return height;
}

function normalizeParentTaskId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error("parentTaskId must be a string or null");
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function validateParentTaskAssignment(
  db: DatabaseClient,
  targetTaskId: string | null,
  requestedParentTaskId: string | null,
): Promise<string | null> {
  if (!requestedParentTaskId) return null;

  const nodes = await listTaskHierarchyNodes(db);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const parentById = buildParentMap(nodes);
  const childrenById = buildChildrenMap(nodes);

  if (!nodeById.has(requestedParentTaskId)) {
    throw new Error("선택한 상위 태스크를 찾을 수 없습니다.");
  }

  if (targetTaskId && requestedParentTaskId === targetTaskId) {
    throw new Error("태스크를 자기 자신 하위로 둘 수 없습니다.");
  }

  if (targetTaskId) {
    let cursor: string | null = requestedParentTaskId;
    while (cursor) {
      if (cursor === targetTaskId) {
        throw new Error("하위 태스크를 상위 태스크로 지정할 수 없습니다.");
      }
      cursor = parentById.get(cursor) ?? null;
    }
  }

  const parentDepth = getTaskDepth(requestedParentTaskId, parentById);
  const subtreeHeight = targetTaskId
    ? getSubtreeHeight(targetTaskId, childrenById)
    : 1;

  if (parentDepth + subtreeHeight > MAX_TASK_DEPTH) {
    throw new Error(
      `태스크 위계는 최대 ${MAX_TASK_DEPTH}단계까지만 허용됩니다.`,
    );
  }

  return requestedParentTaskId;
}

export async function createTaskForDate(
  dateKey: string,
  input: CreateTaskInput,
): Promise<DashboardState> {
  return getDatabase().transaction(async (db) => {
    await prepareWorkDay(db, dateKey);

    const timestamp = new Date().toISOString();
    const taskId = createId();
    const parentTaskId = await validateParentTaskAssignment(
      db,
      null,
      normalizeParentTaskId(input.parentTaskId),
    );

    const createdBy = input.createdByUserId ?? null;
    const assigneeIds = resolveAssigneeIds(input.assigneeUserIds, createdBy);
    // 하위호환: 레거시 컬럼에 첫 번째 담당자 기록 (차후 제거 예정)
    const primaryAssignee = assigneeIds[0] ?? createdBy;

    await db
      .prepare(
        `
        INSERT INTO tasks (
          id, work_date, parent_task_id, title, category, priority, due_date, due_time,
          estimate_minutes, note, status, sort_order,
          created_at, updated_at, completed_at,
          created_by_user_id, assignee_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo', 0, ?, ?, NULL, ?, ?)
      `,
      )
      .run(
        taskId,
        dateKey,
        parentTaskId,
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

    await replaceTaskAssignees(db, taskId, assigneeIds);

    await touchWorkDay(db, dateKey);
    return {
      days: await selectDays(db),
    };
  });
}

export interface UpdateTaskInput {
  title?: string;
  parentTaskId?: string | null;
  category?: string;
  priority?: TaskPriority;
  dueDate?: string;
  dueTime?: string | null;
  note?: string;
  /** 전체 교체 시맨틱. 전달되면 기존 담당자 모두 제거 후 재설정. */
  assigneeUserIds?: string[];
}

export async function updateTaskForDate(
  dateKey: string,
  taskId: string,
  patch: UpdateTaskInput,
): Promise<DashboardState> {
  return getDatabase().transaction(async (db) => {
    await prepareWorkDay(db, dateKey);

    const sets: string[] = [];
    const args: (string | number | null)[] = [];

    if (patch.title !== undefined) {
      sets.push("title = ?");
      args.push(String(patch.title).trim());
    }
    if (patch.parentTaskId !== undefined) {
      const parentTaskId = await validateParentTaskAssignment(
        db,
        taskId,
        normalizeParentTaskId(patch.parentTaskId),
      );
      sets.push("parent_task_id = ?");
      args.push(parentTaskId);
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

      await db
        .prepare(
          `UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND work_date = ?`,
        )
        .run(...args, taskId, dateKey);

      await touchWorkDay(db, dateKey);
    }

    if (patch.assigneeUserIds !== undefined) {
      await replaceTaskAssignees(
        db,
        taskId,
        resolveAssigneeIds(patch.assigneeUserIds, null),
      );
    }

    return {
      days: await selectDays(db),
    };
  });
}

export async function updateTaskStatusForDate(
  dateKey: string,
  taskId: string,
  status: TaskStatus,
): Promise<DashboardState> {
  return getDatabase().transaction(async (db) => {
    await prepareWorkDay(db, dateKey);
    const timestamp = new Date().toISOString();

    await db
      .prepare(
        `
        UPDATE tasks
        SET status = ?, updated_at = ?, completed_at = ?
        WHERE id = ? AND work_date = ?
      `,
      )
      .run(
        status,
        timestamp,
        status === "done" ? timestamp : null,
        taskId,
        dateKey,
      );

    await touchWorkDay(db, dateKey);
    return {
      days: await selectDays(db),
    };
  });
}

export async function deleteTaskForDate(
  dateKey: string,
  taskId: string,
): Promise<DashboardState> {
  return getDatabase().transaction(async (db) => {
    await prepareWorkDay(db, dateKey);
    const childCount =
      (
        await db
          .prepare(`SELECT COUNT(*) AS c FROM tasks WHERE parent_task_id = ?`)
          .get(taskId)
      )?.c ?? 0;
    if (Number(childCount) > 0) {
      throw new Error("하위 태스크가 있어 삭제할 수 없습니다.");
    }
    await db
      .prepare("DELETE FROM tasks WHERE id = ? AND work_date = ?")
      .run(taskId, dateKey);
    await touchWorkDay(db, dateKey);

    return {
      days: await selectDays(db),
    };
  });
}

export async function clearCompletedForDate(
  dateKey: string,
): Promise<DashboardState> {
  return getDatabase().transaction(async (db) => {
    await prepareWorkDay(db, dateKey);
    await db
      .prepare(
        `
        DELETE FROM tasks
        WHERE work_date = ?
          AND status = 'done'
          AND NOT EXISTS (
            SELECT 1 FROM tasks child WHERE child.parent_task_id = tasks.id
          )
      `,
      )
      .run(dateKey);
    await touchWorkDay(db, dateKey);

    return {
      days: await selectDays(db),
    };
  });
}

export async function updateNotesForDate(
  dateKey: string,
  notes: string,
): Promise<DashboardState> {
  return getDatabase().transaction(async (db) => {
    await prepareWorkDay(db, dateKey);
    await db
      .prepare(
        `
        UPDATE work_days
        SET notes = ?, updated_at = datetime('now')
        WHERE work_date = ?
      `,
      )
      .run(notes, dateKey);

    return {
      days: await selectDays(db),
    };
  });
}

export async function updateTimerDurationForDate(
  dateKey: string,
  timerDuration: number,
): Promise<DashboardState> {
  return getDatabase().transaction(async (db) => {
    await prepareWorkDay(db, dateKey);
    await db
      .prepare(
        `
        UPDATE work_days
        SET timer_duration_minutes = ?, updated_at = datetime('now')
        WHERE work_date = ?
      `,
      )
      .run(timerDuration, dateKey);

    return {
      days: await selectDays(db),
    };
  });
}

export async function recordFocusSessionForDate(
  dateKey: string,
  durationMinutes: number,
): Promise<DashboardState> {
  return getDatabase().transaction(async (db) => {
    await prepareWorkDay(db, dateKey);
    const timestamp = new Date().toISOString();

    await db
      .prepare(
        `
        INSERT INTO focus_sessions (
          id, work_date, duration_minutes, started_at, ended_at, source, created_at
        )
        VALUES (?, ?, ?, NULL, ?, 'timer', datetime('now'))
      `,
      )
      .run(createId(), dateKey, durationMinutes, timestamp);

    await db
      .prepare(
        `
        UPDATE work_days
        SET focus_minutes = focus_minutes + ?, updated_at = datetime('now')
        WHERE work_date = ?
      `,
      )
      .run(durationMinutes, dateKey);

    return {
      days: await selectDays(db),
    };
  });
}

export async function getNotionFeedFromStore() {
  const payload = await getJsonSetting<NotionFeed>("notion_feed_payload");
  return payload ?? emptyNotionFeed();
}

export async function setNotionFeedInStore(feed: NotionFeed) {
  await setJsonSetting("notion_feed_payload", feed);
}

export async function getGithubFeedFromStore() {
  const payload = await getJsonSetting<GithubFeed>("github_feed_payload");
  return payload ?? emptyGithubFeed();
}

export async function setGithubFeedInStore(feed: GithubFeed) {
  await setJsonSetting("github_feed_payload", feed);
}

async function getJsonSetting<T>(key: string): Promise<T | null> {
  const row = await getDatabase()
    .prepare(`SELECT value_json FROM app_settings WHERE key = ?`)
    .get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return null;
  }
}

async function setJsonSetting(key: string, value: unknown): Promise<void> {
  await getDatabase()
    .prepare(
      `INSERT INTO app_settings (key, value_json, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT (key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value));
}

async function selectDays(db: DatabaseClient): Promise<WorkDayMap> {
  const workDays = await db
    .prepare(
      `
        SELECT work_date, notes, focus_minutes, timer_duration_minutes
        FROM work_days
        ORDER BY work_date ASC
      `,
    )
    .all();

  const tasks = await db
    .prepare(
      `
        SELECT
          id, work_date, parent_task_id, title, category, priority, due_date, due_time,
          estimate_minutes, note, status, created_at, updated_at, completed_at
        FROM tasks
        ORDER BY work_date ASC, created_at ASC, id ASC
      `,
    )
    .all();

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

  const assigneeMap = await listAssigneesForTasks(
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

async function prepareWorkDay(db: DatabaseClient, dateKey: string) {
  // 조회/수정 요청이 task row 자체를 이동시키면 참조와 이력이 깨진다.
  // work_day row 만 보장하고 task 는 그대로 둔다.
  await ensureWorkDay(db, dateKey);
}

async function ensureWorkDay(db: DatabaseClient, dateKey: string) {
  await db
    .prepare(
      `
      INSERT INTO work_days (work_date, notes, focus_minutes, timer_duration_minutes)
      VALUES (?, '', 0, 25)
      ON CONFLICT(work_date) DO NOTHING
    `,
    )
    .run(dateKey);
}

async function touchWorkDay(db: DatabaseClient, dateKey: string) {
  await db
    .prepare(
      `
      UPDATE work_days
      SET updated_at = datetime('now')
      WHERE work_date = ?
    `,
    )
    .run(dateKey);
}

async function upsertWorkDay(
  db: DatabaseClient,
  dateKey: string,
  notes: string,
  focusMinutes: number,
  timerDuration: number,
) {
  await db
    .prepare(
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
    )
    .run(dateKey, notes, focusMinutes, timerDuration);
}

async function upsertTask(db: DatabaseClient, dateKey: string, task: Task) {
  await db
    .prepare(
      `
      INSERT INTO tasks (
        id, work_date, parent_task_id, title, category, priority, due_date, due_time,
        estimate_minutes, note, status, sort_order,
        created_at, updated_at, completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        work_date = excluded.work_date,
        parent_task_id = excluded.parent_task_id,
        title = excluded.title,
        category = excluded.category,
        priority = excluded.priority,
        due_date = excluded.due_date,
        due_time = excluded.due_time,
        estimate_minutes = excluded.estimate_minutes,
        note = excluded.note,
        status = excluded.status,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at
    `,
    )
    .run(
      task.id,
      dateKey,
      task.parentTaskId,
      task.title,
      task.category,
      task.priority,
      task.dueDate,
      task.dueTime ?? null,
      task.estimate,
      task.note,
      task.status,
      task.createdAt,
      task.updatedAt,
      task.completedAt,
    );

  // assignees 가 제공된 경우에만 교체. (import 경로 호환)
  if (Array.isArray(task.assignees) && task.assignees.length > 0) {
    await replaceTaskAssignees(
      db,
      task.id,
      task.assignees.map((a) => a.userId),
    );
  }
}

function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    parentTaskId: row.parent_task_id,
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
async function replaceTaskAssignees(
  db: DatabaseClient,
  taskId: string,
  userIds: string[],
): Promise<void> {
  await db.prepare(`DELETE FROM task_assignees WHERE task_id = ?`).run(taskId);
  if (userIds.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO task_assignees (task_id, user_id, sort_order) VALUES (?, ?, ?)`,
  );
  for (let i = 0; i < userIds.length; i++) {
    await stmt.run(taskId, userIds[i], i);
  }
}

async function listAssigneesForTasks(
  db: DatabaseClient,
  taskIds: string[],
): Promise<Map<string, { userId: string; userName: string | null }[]>> {
  const result = new Map<
    string,
    { userId: string; userName: string | null }[]
  >();
  if (taskIds.length === 0) return result;
  const placeholders = taskIds.map(() => "?").join(",");
  const rows = await db
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
    .all(...taskIds);
  for (const row of rows) {
    const list = result.get(row.task_id) ?? [];
    list.push({ userId: row.user_id, userName: row.user_name });
    result.set(row.task_id, list);
  }
  return result;
}
