import { getDatabase, type DatabaseClient } from "@libs/postgres-db";

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

export interface CalendarResult {
  range: { from: string; to: string };
  days: Record<string, CalendarDayBucket>;
}

function emptyBucket(): CalendarDayBucket {
  return { tasks: [], notion: [], github: [], lineWorks: [], storage: [] };
}

function ensureBucket(
  days: Record<string, CalendarDayBucket>,
  dateKey: string,
): CalendarDayBucket {
  if (!days[dateKey]) days[dateKey] = emptyBucket();
  return days[dateKey];
}

function localDatePart(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export async function queryCalendar(
  from: string,
  to: string,
): Promise<CalendarResult> {
  return getDatabase().transaction((db) =>
    queryCalendarWithDatabase(db, from, to),
  );
}

async function queryCalendarWithDatabase(
  db: DatabaseClient,
  from: string,
  to: string,
): Promise<CalendarResult> {
  const days: Record<string, CalendarDayBucket> = {};

  // Tasks — work_date
  const taskRows = await db
    .prepare(
      `
        SELECT
          t.id, t.title, t.category, t.priority, t.status,
          t.work_date, t.due_date, t.due_time,
          t.created_by_user_id,
          uc.user_name AS created_by_name
        FROM tasks t
   LEFT JOIN users uc ON uc.user_id = t.created_by_user_id
       WHERE t.work_date >= ? AND t.work_date <= ?
    ORDER BY t.work_date ASC, t.created_at ASC
      `,
    )
    .all<{
      id: string;
      title: string;
      category: string;
      priority: "high" | "medium" | "low";
      status: "todo" | "doing" | "done";
      work_date: string;
      due_date: string;
      due_time: string | null;
      created_by_user_id: string | null;
      created_by_name: string | null;
    }>(from, to);

  // 다중 담당자 로드
  const taskIds = taskRows.map((r) => r.id);
  const assigneeNamesByTask = new Map<string, string[]>();
  if (taskIds.length > 0) {
    const placeholders = taskIds.map(() => "?").join(",");
    const assigneeRows = await db
      .prepare(
        `
          SELECT ta.task_id, COALESCE(u.user_name, ta.user_id) AS name
            FROM task_assignees ta
       LEFT JOIN users u ON u.user_id = ta.user_id
           WHERE ta.task_id IN (${placeholders})
        ORDER BY ta.task_id, ta.sort_order, ta.user_id
        `,
      )
      .all<{ task_id: string; name: string }>(...taskIds);
    for (const row of assigneeRows) {
      const list = assigneeNamesByTask.get(row.task_id) ?? [];
      list.push(row.name);
      assigneeNamesByTask.set(row.task_id, list);
    }
  }

  for (const row of taskRows) {
    const bucket = ensureBucket(days, row.work_date);
    bucket.tasks.push({
      id: row.id,
      title: row.title,
      category: row.category,
      priority: row.priority,
      status: row.status,
      workDate: row.work_date,
      dueDate: row.due_date,
      dueTime: row.due_time,
      assigneeNames: assigneeNamesByTask.get(row.id) ?? [],
      createdByName: row.created_by_name,
    });
  }

  // Notion — edited_at 우선
  const notionRows = await db
    .prepare(
      `
        SELECT event_id, title, page_url, section_title, parent_title,
               editor_name, edited_at, received_at
          FROM notion_update_events
         WHERE COALESCE(edited_at::date, received_at::date) BETWEEN ? AND ?
      ORDER BY COALESCE(edited_at, received_at) DESC
      `,
    )
    .all<{
      event_id: string;
      title: string;
      page_url: string;
      section_title: string | null;
      parent_title: string | null;
      editor_name: string | null;
      edited_at: string | null;
      received_at: string;
    }>(from, to);

  for (const row of notionRows) {
    const dateKey =
      localDatePart(row.edited_at) ?? localDatePart(row.received_at);
    if (!dateKey) continue;
    const bucket = ensureBucket(days, dateKey);
    bucket.notion.push({
      eventId: row.event_id,
      title: row.title,
      url: row.page_url,
      section: row.section_title,
      parent: row.parent_title,
      editor: row.editor_name,
      editedAt: row.edited_at,
    });
  }

  // GitHub commit events
  const commitRows = await db
    .prepare(
      `
        SELECT owner_name, repo_name, title, commit_url, occurred_at, author_name, status
          FROM github_commit_events
         WHERE occurred_at::date BETWEEN ? AND ?
      ORDER BY occurred_at DESC
      `,
    )
    .all<{
      owner_name: string;
      repo_name: string;
      title: string;
      commit_url: string;
      occurred_at: string | null;
      author_name: string | null;
      status: string | null;
    }>(from, to);

  for (const row of commitRows) {
    const dateKey = localDatePart(row.occurred_at);
    if (!dateKey) continue;
    const bucket = ensureBucket(days, dateKey);
    bucket.github.push({
      kind: "commit",
      repo: `${row.owner_name}/${row.repo_name}`,
      title: row.title,
      url: row.commit_url,
      occurredAt: row.occurred_at,
      author: row.author_name,
      status: row.status,
    });
  }

  // GitHub PR events
  const prRows = await db
    .prepare(
      `
        SELECT owner_name, repo_name, title, pr_url, occurred_at, author_name, status
          FROM github_pr_events
         WHERE occurred_at::date BETWEEN ? AND ?
      ORDER BY occurred_at DESC
      `,
    )
    .all<{
      owner_name: string;
      repo_name: string;
      title: string;
      pr_url: string;
      occurred_at: string | null;
      author_name: string | null;
      status: string | null;
    }>(from, to);

  for (const row of prRows) {
    const dateKey = localDatePart(row.occurred_at);
    if (!dateKey) continue;
    const bucket = ensureBucket(days, dateKey);
    bucket.github.push({
      kind: "pr",
      repo: `${row.owner_name}/${row.repo_name}`,
      title: row.title,
      url: row.pr_url,
      occurredAt: row.occurred_at,
      author: row.author_name,
      status: row.status,
    });
  }

  // LINE WORKS messages
  const lwRows = await db
    .prepare(
      `
        SELECT m.message_id, m.channel_id, m.user_id, m.content_type,
               m.text, m.issued_at, m.received_at,
               c.title AS channel_title
          FROM line_works_messages m
     LEFT JOIN line_works_channels c ON c.channel_id = m.channel_id
         WHERE COALESCE(m.issued_at::date, m.received_at::date) BETWEEN ? AND ?
      ORDER BY COALESCE(m.issued_at, m.received_at) DESC
      `,
    )
    .all<{
      message_id: string;
      channel_id: string;
      user_id: string | null;
      content_type: string;
      text: string | null;
      issued_at: string | null;
      received_at: string;
      channel_title: string | null;
    }>(from, to);

  for (const row of lwRows) {
    const dateKey =
      localDatePart(row.issued_at) ?? localDatePart(row.received_at);
    if (!dateKey) continue;
    const bucket = ensureBucket(days, dateKey);
    bucket.lineWorks.push({
      messageId: row.message_id,
      channelId: row.channel_id,
      channelTitle: row.channel_title,
      userId: row.user_id,
      contentType: row.content_type,
      text: row.text,
      issuedAt: row.issued_at,
    });
  }

  // Storage attachments
  const storageRows = await db
    .prepare(
      `
        SELECT a.id, a.file_name, a.mime_type, a.file_size, a.uploaded_at,
               a.message_id, m.channel_id, c.title AS channel_title
          FROM line_works_attachments a
     LEFT JOIN line_works_messages m ON m.message_id = a.message_id
     LEFT JOIN line_works_channels c ON c.channel_id = m.channel_id
         WHERE a.uploaded_at::date BETWEEN ? AND ?
      ORDER BY a.uploaded_at DESC
      `,
    )
    .all<{
      id: number;
      file_name: string | null;
      mime_type: string | null;
      file_size: number | null;
      uploaded_at: string | null;
      message_id: string;
      channel_id: string | null;
      channel_title: string | null;
    }>(from, to);

  for (const row of storageRows) {
    const dateKey = localDatePart(row.uploaded_at);
    if (!dateKey) continue;
    const bucket = ensureBucket(days, dateKey);
    bucket.storage.push({
      id: row.id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      uploadedAt: row.uploaded_at,
      messageId: row.message_id,
      channelId: row.channel_id,
      channelTitle: row.channel_title,
    });
  }

  return { range: { from, to }, days };
}
