export const STORAGE_KEY = "work-tracking.dashboard.v1";

export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: string;
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

export interface NotionFeedPagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface NotionFeed {
  lastSyncedAt: string | null;
  items: NotionUpdateItem[];
  pagination: NotionFeedPagination;
  readEventIds: string[];
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

export const priorityLabel: Record<TaskPriority, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

export function emptyNotionFeed(): NotionFeed {
  return {
    lastSyncedAt: null,
    items: [],
    pagination: {
      page: 1,
      perPage: 20,
      total: 0,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
    readEventIds: [],
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
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `task-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

export function loadDaysFromStorage(): WorkDayMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return normalizeState(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}"),
    );
  } catch {
    return {};
  }
}

export function saveDaysToStorage(days: WorkDayMap) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(days));
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

export function normalizeDay(day: unknown, dateKey: string): WorkDay {
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

export function normalizeTask(task: unknown, dateKey: string): Task {
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
    title: typeof value.title === "string" ? value.title : "",
    category: typeof value.category === "string" ? value.category : "",
    priority: isTaskPriority(value.priority) ? value.priority : "medium",
    dueDate: isDateKey(value.dueDate) ? value.dueDate : dateKey,
    dueTime:
      typeof value.dueTime === "string" && /^\d{2}:\d{2}$/.test(value.dueTime)
        ? value.dueTime
        : null,
    estimate: Math.max(0, Number(value.estimate) || 0),
    note: typeof value.note === "string" ? value.note : "",
    status: isTaskStatus(value.status) ? value.status : "todo",
    createdAt,
    updatedAt,
    completedAt: isValidDateTime(value.completedAt) ? value.completedAt : null,
  };
}

export function cloneDays(days: WorkDayMap): WorkDayMap {
  return Object.fromEntries(
    Object.entries(days).map(([dateKey, day]) => [
      dateKey,
      {
        ...day,
        tasks: day.tasks.map((task) => ({ ...task })),
      },
    ]),
  );
}

export function getDay(days: WorkDayMap, dateKey: string): WorkDay {
  return days[dateKey] ?? createEmptyDay();
}

export function prepareDays(days: WorkDayMap, dateKey: string): WorkDayMap {
  const next = cloneDays(days);

  if (!next[dateKey]) {
    next[dateKey] = createEmptyDay();
  }

  return next;
}

export function sortTasksForDisplay(tasks: Task[]) {
  return [...tasks].sort(compareTasksForDisplay);
}

export function compareTasksForDisplay(left: Task, right: Task) {
  const priorityScore: Record<TaskPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return (
    Number(isTaskOverdue(right)) - Number(isTaskOverdue(left)) ||
    priorityScore[getEffectivePriority(left)] -
      priorityScore[getEffectivePriority(right)] ||
    left.dueDate.localeCompare(right.dueDate) ||
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}

export function getEffectivePriority(task: Task): TaskPriority {
  if (
    task.status !== "done" &&
    (task.priority === "high" || isTaskOverdue(task))
  ) {
    return "high";
  }

  return task.priority;
}

export function isTaskOverdue(
  task: Pick<Task, "status" | "dueDate">,
  referenceDateKey = todayKey(),
) {
  return (
    task.status !== "done" &&
    isDateKey(task.dueDate) &&
    task.dueDate < referenceDateKey
  );
}

export function getTaskFlag(task: Task, referenceDateKey = todayKey()) {
  if (isTaskOverdue(task, referenceDateKey)) {
    return {
      label: `${daysPastDue(task.dueDate, referenceDateKey)}일 지연`,
      kind: "overdue" as const,
    };
  }

  return null;
}

export function formatDeadlineLabel(task: Task, referenceDateKey = todayKey()) {
  if (!isDateKey(task.dueDate)) {
    return "마감 미정";
  }

  if (isTaskOverdue(task, referenceDateKey)) {
    return `마감 ${formatShortDate(task.dueDate)} · ${daysPastDue(task.dueDate, referenceDateKey)}일 지남`;
  }

  if (task.dueDate === referenceDateKey) {
    return "오늘 마감";
  }

  return `마감 ${formatShortDate(task.dueDate)}`;
}

export function buildActivitySubtitle(task: Task) {
  return `${task.category || "분류 없음"} 카테고리로 저장됨`;
}

export function daysPastDue(dateKey: string, referenceDateKey = todayKey()) {
  return Math.max(1, daysBetweenDateKeys(dateKey, referenceDateKey));
}

export function daysBetweenDateKeys(startDateKey: string, endDateKey: string) {
  const start = parseDateKey(startDateKey).getTime();
  const end = parseDateKey(endDateKey).getTime();
  return Math.round((end - start) / 86400000);
}

export function todayKey() {
  return formatDateKey(new Date());
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatShortDate(dateKey: string | null) {
  if (!isDateKey(dateKey)) {
    return "날짜 미정";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(parseDateKey(dateKey));
}

export function formatDateCaption(dateKey: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(parseDateKey(dateKey));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(elapsed / 60000));

  if (minutes < 60) {
    return `${minutes}분 전`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}시간 전`;
  }

  const days = Math.round(hours / 24);
  return `${days}일 전`;
}

export function statusLabel(status: TaskStatus) {
  if (status === "done") return "완료";
  if (status === "doing") return "진행 중";
  return "등록됨";
}

export function activityIcon(priority: TaskPriority) {
  if (priority === "high") return "!";
  if (priority === "medium") return "•";
  return "○";
}

export function activityColor(priority: TaskPriority) {
  if (priority === "high") return "#ba1a1a";
  if (priority === "medium") return "#9e4300";
  return "#1f8d4d";
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
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
