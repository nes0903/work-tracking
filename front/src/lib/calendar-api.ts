export interface CalendarTaskSummary {
  id: string;
  title: string;
  category: string;
  priority: "high" | "medium" | "low";
  status: "todo" | "doing" | "done";
  workDate: string;
  dueDate: string;
  dueTime: string | null;
  assigneeNames: string[];
  createdByName: string | null;
}

export interface CalendarNotionSummary {
  eventId: string;
  title: string;
  url: string;
  section: string | null;
  parent: string | null;
  editor: string | null;
  editedAt: string | null;
}

export interface CalendarGithubSummary {
  kind: "commit" | "pr";
  repo: string;
  title: string;
  url: string;
  occurredAt: string | null;
  author: string | null;
  status: string | null;
}

export interface CalendarLineWorksSummary {
  messageId: string;
  channelId: string;
  channelTitle: string | null;
  userId: string | null;
  contentType: string;
  text: string | null;
  issuedAt: string | null;
}

export interface CalendarStorageSummary {
  id: number;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
  messageId: string;
  channelId: string | null;
  channelTitle: string | null;
}

export interface CalendarDayBucket {
  tasks: CalendarTaskSummary[];
  notion: CalendarNotionSummary[];
  github: CalendarGithubSummary[];
  lineWorks: CalendarLineWorksSummary[];
  storage: CalendarStorageSummary[];
}

export interface CalendarResponse {
  range: { from: string; to: string };
  days: Record<string, CalendarDayBucket>;
}

export function emptyDayBucket(): CalendarDayBucket {
  return { tasks: [], notion: [], github: [], lineWorks: [], storage: [] };
}

export function getDayBucket(
  days: Record<string, CalendarDayBucket>,
  dateKey: string,
): CalendarDayBucket {
  return days[dateKey] ?? emptyDayBucket();
}

export function countDayEvents(bucket: CalendarDayBucket): number {
  return (
    bucket.tasks.length +
    bucket.notion.length +
    bucket.github.length +
    bucket.lineWorks.length +
    bucket.storage.length
  );
}

export async function fetchCalendar(
  from: string,
  to: string,
): Promise<CalendarResponse> {
  const params = new URLSearchParams({ from, to });
  const response = await fetch(`/api/calendar?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as {
    ok: boolean;
    range?: { from: string; to: string };
    days?: Record<string, CalendarDayBucket>;
    error?: string;
  };
  if (!payload.ok) throw new Error(payload.error ?? "calendar fetch failed");
  return {
    range: payload.range ?? { from, to },
    days: payload.days ?? {},
  };
}

/**
 * 주어진 월(YYYY-MM-01 기준)의 그리드를 월요일 시작 6주로 계산해
 * ISO date 문자열 2D 배열을 반환한다.
 */
export function buildMonthGrid(anchor: Date): {
  weeks: string[][];
  monthStart: string;
  monthEnd: string;
  gridFrom: string;
  gridTo: string;
} {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);

  const firstDayIdx = (first.getDay() + 6) % 7; // Mon=0
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - firstDayIdx);

  const weeks: string[][] = [];
  const cursor = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const row: string[] = [];
    for (let d = 0; d < 7; d++) {
      row.push(fmtDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(row);
  }
  const gridEnd = new Date(cursor);
  gridEnd.setDate(gridEnd.getDate() - 1);

  return {
    weeks,
    monthStart: fmtDateKey(first),
    monthEnd: fmtDateKey(last),
    gridFrom: fmtDateKey(gridStart),
    gridTo: fmtDateKey(gridEnd),
  };
}

export function fmtDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map((n) => Number(n));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function monthLabel(anchor: Date): string {
  return `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월`;
}

export function dayLabel(dateKey: string): string {
  const d = parseDateKey(dateKey);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${dateKey} (${weekday})`;
}
