import { getDatabase } from "@libs/sqlite-db";

export interface CalendarTaskSummary {
  id: string;
  title: string;
  category: string;
  priority: "high" | "medium" | "low";
  status: "todo" | "doing" | "done";
  workDate: string;
  dueDate: string;
  dueTime: string | null;
  assigneeName: string | null;
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

export function queryCalendar(from: string, to: string): CalendarResult {
  const db = getDatabase();
  const days: Record<string, CalendarDayBucket> = {};

  // Tasks — work_date
  const taskRows = db
    .prepare(
      `
        SELECT
          t.id, t.title, t.category, t.priority, t.status,
          t.work_date, t.due_date, t.due_time,
          t.created_by_user_id, t.assignee_user_id,
          uc.user_name AS created_by_name,
          ua.user_name AS assignee_name
        FROM tasks t
   LEFT JOIN users uc ON uc.user_id = t.created_by_user_id
   LEFT JOIN users ua ON ua.user_id = t.assignee_user_id
       WHERE t.work_date >= ? AND t.work_date <= ?
    ORDER BY t.work_date ASC, datetime(t.created_at) ASC
      `,
    )
    .all(from, to) as Array<{
      id: string;
      title: string;
      category: string;
      priority: "high" | "medium" | "low";
      status: "todo" | "doing" | "done";
      work_date: string;
      due_date: string;
      due_time: string | null;
      created_by_user_id: string | null;
      assignee_user_id: string | null;
      created_by_name: string | null;
      assignee_name: string | null;
    }>;

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
      assigneeName: row.assignee_name,
      createdByName: row.created_by_name,
    });
  }

  // Notion — edited_at 우선
  const notionRows = db
    .prepare(
      `
        SELECT event_id, title, page_url, section_title, parent_title,
               editor_name, edited_at, received_at
          FROM notion_update_events
         WHERE COALESCE(substr(edited_at,1,10), substr(received_at,1,10)) BETWEEN ? AND ?
      ORDER BY COALESCE(edited_at, received_at) DESC
      `,
    )
    .all(from, to) as Array<{
      event_id: string;
      title: string;
      page_url: string;
      section_title: string | null;
      parent_title: string | null;
      editor_name: string | null;
      edited_at: string | null;
      received_at: string;
    }>;

  for (const row of notionRows) {
    const dateKey = localDatePart(row.edited_at) ?? localDatePart(row.received_at);
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
  const commitRows = db
    .prepare(
      `
        SELECT owner_name, repo_name, title, commit_url, occurred_at, author_name, status
          FROM github_commit_events
         WHERE substr(occurred_at, 1, 10) BETWEEN ? AND ?
      ORDER BY occurred_at DESC
      `,
    )
    .all(from, to) as Array<{
      owner_name: string;
      repo_name: string;
      title: string;
      commit_url: string;
      occurred_at: string | null;
      author_name: string | null;
      status: string;
    }>;

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
  const prRows = db
    .prepare(
      `
        SELECT owner_name, repo_name, title, pr_url, occurred_at, author_name, status
          FROM github_pr_events
         WHERE substr(occurred_at, 1, 10) BETWEEN ? AND ?
      ORDER BY occurred_at DESC
      `,
    )
    .all(from, to) as Array<{
      owner_name: string;
      repo_name: string;
      title: string;
      pr_url: string;
      occurred_at: string | null;
      author_name: string | null;
      status: string | null;
    }>;

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
  const lwRows = db
    .prepare(
      `
        SELECT m.message_id, m.channel_id, m.user_id, m.content_type,
               m.text, m.issued_at, m.received_at,
               c.title AS channel_title
          FROM line_works_messages m
     LEFT JOIN line_works_channels c ON c.channel_id = m.channel_id
         WHERE COALESCE(substr(m.issued_at,1,10), substr(m.received_at,1,10)) BETWEEN ? AND ?
      ORDER BY COALESCE(m.issued_at, m.received_at) DESC
      `,
    )
    .all(from, to) as Array<{
      message_id: string;
      channel_id: string;
      user_id: string | null;
      content_type: string;
      text: string | null;
      issued_at: string | null;
      received_at: string;
      channel_title: string | null;
    }>;

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
      text: row.text ? row.text.slice(0, 80) : null,
      issuedAt: row.issued_at,
    });
  }

  // Storage attachments
  const storageRows = db
    .prepare(
      `
        SELECT a.id, a.file_name, a.mime_type, a.file_size, a.uploaded_at,
               a.message_id, m.channel_id, c.title AS channel_title
          FROM line_works_attachments a
     LEFT JOIN line_works_messages m ON m.message_id = a.message_id
     LEFT JOIN line_works_channels c ON c.channel_id = m.channel_id
         WHERE substr(a.uploaded_at, 1, 10) BETWEEN ? AND ?
      ORDER BY a.uploaded_at DESC
      `,
    )
    .all(from, to) as Array<{
      id: number;
      file_name: string | null;
      mime_type: string | null;
      file_size: number | null;
      uploaded_at: string | null;
      message_id: string;
      channel_id: string | null;
      channel_title: string | null;
    }>;

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
