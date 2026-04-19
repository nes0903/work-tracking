export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: string;
  lineageId: string;
  title: string;
  category: string;
  priority: TaskPriority;
  dueDate: string;
  dueTime: string | null;
  estimate: number;
  note: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  carryoverCount: number;
  carriedFromDate: string | null;
  completedAt: string | null;
}

export interface WorkDay {
  tasks: Task[];
  notes: string;
  focusMinutes: number;
  timerDuration: number;
}

export type WorkDayMap = Record<string, WorkDay>;

export interface NotionUpdateItem {
  eventId?: string;
  type?: string;
  title?: string;
  link?: string;
  section?: string;
  parent?: string | null;
  editor?: string | null;
  editedAt?: string | null;
  url?: string;
  summary?: string;
}

export interface NotionFeed {
  lastSyncedAt: string | null;
  items: NotionUpdateItem[];
}

export interface GithubEvent {
  title?: string;
  kind?: string;
  author?: string;
  status?: string;
  occurredAt?: string;
  url?: string;
}

export interface GithubPullRequest {
  number?: number;
  title?: string;
  base?: string;
  head?: string;
  author?: string;
  draft?: boolean;
  state?: string;
  url?: string;
  updatedAt?: string;
}

export interface GithubRepo {
  repo?: string;
  defaultBranch?: string;
  openPrCount?: number;
  repoUrl?: string;
  latestCommit?: {
    message?: string;
    shortSha?: string;
    sha?: string;
    committedAt?: string;
    url?: string;
  };
  recentCommitEvents?: GithubEvent[];
  prs?: GithubPullRequest[];
  prEvents?: GithubEvent[];
}

export interface GithubFeed {
  lastSyncedAt: string | null;
  repos: GithubRepo[];
  items: GithubEvent[];
}

export function emptyNotionFeed(): NotionFeed {
  return {
    lastSyncedAt: null,
    items: [],
  };
}

export function emptyGithubFeed(): GithubFeed {
  return {
    lastSyncedAt: null,
    repos: [],
    items: [],
  };
}

export function createEmptyDay(): WorkDay {
  return {
    tasks: [],
    notes: "",
    focusMinutes: 0,
    timerDuration: 25,
  };
}

export function createId() {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `task-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

export function normalizeState(rawState: unknown): WorkDayMap {
  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawState)
      .filter(([dateKey]) => isDateKey(dateKey))
      .map(([dateKey, day]) => [dateKey, normalizeDay(day, dateKey)]),
  );
}

function normalizeDay(day: unknown, dateKey: string): WorkDay {
  const value = (day ?? {}) as Partial<WorkDay>;

  return {
    tasks: Array.isArray(value.tasks)
      ? value.tasks.map((task) => normalizeTask(task, dateKey))
      : [],
    notes: typeof value.notes === "string" ? value.notes : "",
    focusMinutes: Math.max(0, Number(value.focusMinutes) || 0),
    timerDuration: clamp(Number(value.timerDuration || 25), 1, 180),
  };
}

function normalizeTask(task: unknown, dateKey: string): Task {
  const value = (task ?? {}) as Partial<Task>;
  const id = typeof value.id === "string" && value.id ? value.id : createId();
  const createdAt = isValidDateTime(value.createdAt)
    ? value.createdAt
    : new Date(`${dateKey}T09:00:00`).toISOString();
  const updatedAt = isValidDateTime(value.updatedAt)
    ? value.updatedAt
    : createdAt;

  return {
    id,
    lineageId:
      typeof value.lineageId === "string" && value.lineageId
        ? value.lineageId
        : id,
    title: typeof value.title === "string" ? value.title : "",
    category: typeof value.category === "string" ? value.category : "",
    priority: isTaskPriority(value.priority) ? value.priority : "medium",
    dueDate: isDateKey(value.dueDate) ? value.dueDate : dateKey,
    dueTime: isDueTime(value.dueTime) ? value.dueTime : null,
    estimate: Math.max(0, Number(value.estimate) || 0),
    note: typeof value.note === "string" ? value.note : "",
    status: isTaskStatus(value.status) ? value.status : "todo",
    createdAt,
    updatedAt,
    carryoverCount: Math.max(0, Number(value.carryoverCount) || 0),
    carriedFromDate: isDateKey(value.carriedFromDate)
      ? value.carriedFromDate
      : null,
    completedAt: isValidDateTime(value.completedAt) ? value.completedAt : null,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isDueTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function isValidDateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return value === "high" || value === "medium" || value === "low";
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "todo" || value === "doing" || value === "done";
}
