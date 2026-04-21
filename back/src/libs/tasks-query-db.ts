import { getDatabase } from "@libs/sqlite-db";
import { listUsers } from "@libs/users-db";

export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "high" | "medium" | "low";
export type SortKey = "priority" | "due" | "created";

export interface TaskQueryParams {
  from?: string | null;
  to?: string | null;
  assignee?: string | null;
  creator?: string | null;
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  category?: string | null;
  q?: string | null;
  sort?: SortKey;
  order?: "asc" | "desc";
  page?: number;
  perPage?: number;
  sessionUserId?: string | null;
}

export interface TaskListItem {
  id: string;
  parentTaskId: string | null;
  parentTitle: string | null;
  depth: number;
  childCount: number;
  title: string;
  category: string;
  priority: TaskPriority;
  status: TaskStatus;
  workDate: string;
  dueDate: string;
  dueTime: string | null;
  estimate: number;
  note: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  createdBy: { userId: string; userName: string | null } | null;
  assignees: Array<{ userId: string; userName: string | null }>;
  referenceCount: number;
}

export interface TaskQueryResult {
  items: TaskListItem[];
  users: Array<{ userId: string; userName: string | null }>;
  counts: { todo: number; doing: number; done: number; total: number };
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const PER_PAGE_OPTIONS = [20, 50, 70, 100] as const;
const DEFAULT_PER_PAGE = 20;

interface TaskQueryRow {
  id: string;
  parent_task_id: string | null;
  parent_title: string | null;
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
  created_by_user_id: string | null;
  created_by_name: string | null;
  ref_count: number;
  child_count: number;
}

export function queryTasks(params: TaskQueryParams): TaskQueryResult {
  const db = getDatabase();

  const page = Math.max(1, params.page ?? 1);
  const perPage = PER_PAGE_OPTIONS.includes(
    (params.perPage ?? DEFAULT_PER_PAGE) as (typeof PER_PAGE_OPTIONS)[number],
  )
    ? (params.perPage as number)
    : DEFAULT_PER_PAGE;
  const sort: SortKey = params.sort ?? "priority";
  const order: "asc" | "desc" = params.order === "asc" ? "asc" : "desc";

  // WHERE 구성 (status 제외 — counts 를 위해 분리)
  const baseWhere: string[] = [];
  const baseArgs: (string | number)[] = [];

  if (params.from) {
    baseWhere.push(`t.work_date >= ?`);
    baseArgs.push(params.from);
  }
  if (params.to) {
    baseWhere.push(`t.work_date <= ?`);
    baseArgs.push(params.to);
  }

  const resolveUser = (value: string | null | undefined): string | null => {
    if (!value || value === "all") return null;
    if (value === "me") return params.sessionUserId ?? null;
    return value;
  };

  const assigneeId = resolveUser(params.assignee);
  if (assigneeId) {
    // 다중 담당자 지원: task_assignees 에 해당 user 가 포함된 task 만
    baseWhere.push(
      `EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)`,
    );
    baseArgs.push(assigneeId);
  }

  const creatorId = resolveUser(params.creator);
  if (creatorId) {
    baseWhere.push(`t.created_by_user_id = ?`);
    baseArgs.push(creatorId);
  }

  if (params.priorities && params.priorities.length > 0) {
    baseWhere.push(
      `t.priority IN (${params.priorities.map(() => "?").join(",")})`,
    );
    baseArgs.push(...params.priorities);
  }

  if (params.category && params.category.trim()) {
    baseWhere.push(`LOWER(t.category) LIKE ?`);
    baseArgs.push(`%${params.category.trim().toLowerCase()}%`);
  }

  if (params.q && params.q.trim()) {
    baseWhere.push(
      `(LOWER(t.title) LIKE ? OR LOWER(t.category) LIKE ? OR LOWER(t.note) LIKE ?)`,
    );
    const q = `%${params.q.trim().toLowerCase()}%`;
    baseArgs.push(q, q, q);
  }

  const baseWhereSql = baseWhere.length > 0 ? baseWhere.join(" AND ") : "1=1";

  // Status filter — 아이템/total 에는 반영, counts 에는 반영 안 함
  const statusClause =
    params.statuses && params.statuses.length > 0
      ? `t.status IN (${params.statuses.map(() => "?").join(",")})`
      : null;
  const statusArgs = params.statuses ?? [];
  const fullWhereSql = statusClause
    ? `${baseWhereSql} AND ${statusClause}`
    : baseWhereSql;

  // Counts (by status, status 필터 제외)
  const countRows = db
    .prepare(
      `
        SELECT t.status, COUNT(*) AS c
          FROM tasks t
         WHERE ${baseWhereSql}
         GROUP BY t.status
      `,
    )
    .all(...baseArgs) as Array<{ status: TaskStatus; c: number }>;
  const counts = { todo: 0, doing: 0, done: 0, total: 0 };
  for (const row of countRows) {
    if (row.status === "todo") counts.todo = row.c;
    else if (row.status === "doing") counts.doing = row.c;
    else if (row.status === "done") counts.done = row.c;
    counts.total += row.c;
  }

  // Total (페이지네이션용 — status 필터 포함)
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM tasks t WHERE ${fullWhereSql}`)
    .get(...baseArgs, ...statusArgs) as { c: number };
  const total = totalRow?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const hierarchyRows = db
    .prepare(`SELECT id, parent_task_id FROM tasks`)
    .all() as Array<{ id: string; parent_task_id: string | null }>;
  const parentById = new Map(
    hierarchyRows.map((row) => [row.id, row.parent_task_id ?? null]),
  );
  const depthCache = new Map<string, number>();

  const getDepth = (taskId: string, visiting = new Set<string>()): number => {
    const cached = depthCache.get(taskId);
    if (cached) return cached;
    if (visiting.has(taskId)) return 1;
    visiting.add(taskId);
    const parentId = parentById.get(taskId) ?? null;
    const depth = parentId ? getDepth(parentId, visiting) + 1 : 1;
    visiting.delete(taskId);
    depthCache.set(taskId, depth);
    return depth;
  };

  // 정렬
  const priorityRank = `CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END`;
  const dir = order.toUpperCase();
  const orderSql = ((): string => {
    switch (sort) {
      case "priority":
        return `${priorityRank} ${dir}, date(t.due_date) ASC, datetime(t.created_at) DESC`;
      case "due":
        return `date(t.due_date) ${dir}, ${priorityRank} DESC, datetime(t.created_at) DESC`;
      case "created":
        return `datetime(t.created_at) ${dir}`;
      default:
        return `datetime(t.created_at) DESC`;
    }
  })();

  const offset = (page - 1) * perPage;

  const rows = db
    .prepare(
      `
        SELECT
          t.id,
          t.parent_task_id,
          pt.title AS parent_title,
          t.work_date,
          t.title,
          t.category,
          t.priority,
          t.due_date,
          t.due_time,
          t.estimate_minutes,
          t.note,
          t.status,
          t.created_at,
          t.updated_at,
          t.completed_at,
          t.created_by_user_id,
          uc.user_name AS created_by_name,
          (SELECT COUNT(*) FROM task_references r WHERE r.task_id = t.id) AS ref_count,
          (SELECT COUNT(*) FROM tasks child WHERE child.parent_task_id = t.id) AS child_count
        FROM tasks t
   LEFT JOIN users uc ON uc.user_id = t.created_by_user_id
   LEFT JOIN tasks pt ON pt.id = t.parent_task_id
       WHERE ${fullWhereSql}
    ORDER BY ${orderSql}
       LIMIT ? OFFSET ?
      `,
    )
    .all(
      ...baseArgs,
      ...statusArgs,
      perPage,
      offset,
    ) as unknown as TaskQueryRow[];

  // 다중 담당자 로드: 현재 페이지의 task id 들에 대해서만 한 번의 쿼리로 가져온다
  const taskIds = rows.map((r) => r.id);
  const assigneesByTask = new Map<
    string,
    Array<{ userId: string; userName: string | null }>
  >();
  if (taskIds.length > 0) {
    const placeholders = taskIds.map(() => "?").join(",");
    const assigneeRows = db
      .prepare(
        `
          SELECT ta.task_id, ta.user_id, u.user_name, ta.sort_order
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
    for (const r of assigneeRows) {
      const list = assigneesByTask.get(r.task_id) ?? [];
      list.push({ userId: r.user_id, userName: r.user_name });
      assigneesByTask.set(r.task_id, list);
    }
  }

  const items: TaskListItem[] = rows.map((row) => ({
    id: row.id,
    parentTaskId: row.parent_task_id,
    parentTitle: row.parent_title,
    depth: getDepth(row.id),
    childCount: row.child_count ?? 0,
    title: row.title,
    category: row.category,
    priority: row.priority,
    status: row.status,
    workDate: row.work_date,
    dueDate: row.due_date,
    dueTime: row.due_time,
    estimate: row.estimate_minutes,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    createdBy: row.created_by_user_id
      ? { userId: row.created_by_user_id, userName: row.created_by_name }
      : null,
    assignees: assigneesByTask.get(row.id) ?? [],
    referenceCount: row.ref_count ?? 0,
  }));

  const users = listUsers().map((u) => ({
    userId: u.userId,
    userName: u.userName,
  }));

  return {
    items,
    users,
    counts,
    pagination: {
      page,
      perPage,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}
