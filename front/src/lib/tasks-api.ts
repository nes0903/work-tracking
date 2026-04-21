export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "high" | "medium" | "low";
export type TaskSortKey = "priority" | "due" | "created";

export interface UserRef {
  userId: string;
  userName: string | null;
}

export interface TaskListItem {
  id: string;
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
  createdBy: UserRef | null;
  assignees: UserRef[];
  referenceCount: number;
}

export interface TasksPagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface TaskQueryResponse {
  items: TaskListItem[];
  users: UserRef[];
  counts: { todo: number; doing: number; done: number; total: number };
  pagination: TasksPagination;
}

export interface TaskQueryInput {
  from?: string;
  to?: string;
  assignee?: string;
  creator?: string;
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  category?: string;
  q?: string;
  sort?: TaskSortKey;
  order?: "asc" | "desc";
  page?: number;
  perPage?: number;
}

export const PER_PAGE_OPTIONS = [20, 50, 70, 100] as const;
export type PerPageOption = (typeof PER_PAGE_OPTIONS)[number];

export async function fetchTasks(
  input: TaskQueryInput,
): Promise<TaskQueryResponse> {
  const params = new URLSearchParams();
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.assignee) params.set("assignee", input.assignee);
  if (input.creator) params.set("creator", input.creator);
  if (input.statuses && input.statuses.length > 0) {
    params.set("status", input.statuses.join(","));
  }
  if (input.priorities && input.priorities.length > 0) {
    params.set("priority", input.priorities.join(","));
  }
  if (input.category) params.set("category", input.category);
  if (input.q) params.set("q", input.q);
  if (input.sort) params.set("sort", input.sort);
  if (input.order) params.set("order", input.order);
  if (input.page) params.set("page", String(input.page));
  if (input.perPage) params.set("perPage", String(input.perPage));

  const response = await fetch(`/api/tasks?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    ok: boolean;
  } & Partial<TaskQueryResponse>;
  if (!payload.ok) throw new Error("fetch failed");
  return {
    items: payload.items ?? [],
    users: payload.users ?? [],
    counts: payload.counts ?? { todo: 0, doing: 0, done: 0, total: 0 },
    pagination: payload.pagination ?? {
      page: 1,
      perPage: 20,
      total: 0,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  };
}

export async function fetchUsers(): Promise<UserRef[]> {
  try {
    const response = await fetch("/api/users", { cache: "no-store" });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      ok: boolean;
      items?: UserRef[];
    };
    return payload.ok ? (payload.items ?? []) : [];
  } catch {
    return [];
  }
}

/** 이번 주 월요일~일요일 (local time 기준 ISO date) */
export function thisWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon
  const monOffset = (day + 6) % 7; // 월요일까지 뒤로
  const monday = new Date(now);
  monday.setDate(now.getDate() - monOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(monday), to: fmt(sunday) };
}

export function priorityLabel(p: TaskPriority): string {
  return p === "high" ? "높음" : p === "medium" ? "중간" : "낮음";
}

export function statusLabel(s: TaskStatus): string {
  return s === "todo" ? "할 일" : s === "doing" ? "진행 중" : "완료";
}

/** 오늘 기준 마감일까지 남은 표시. 음수면 지남, 0이면 오늘. */
export function dueBadge(dueDateISO: string): {
  text: string;
  tone: "overdue" | "today" | "tomorrow" | "future" | "done";
} {
  if (!dueDateISO) return { text: "-", tone: "future" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateISO);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: `${-diff}일 지남`, tone: "overdue" };
  if (diff === 0) return { text: "오늘 마감", tone: "today" };
  if (diff === 1) return { text: "내일 마감", tone: "tomorrow" };
  return { text: `D-${diff}`, tone: "future" };
}
