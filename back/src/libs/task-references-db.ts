import { getDatabase } from "@libs/sqlite-db";

export type ReferenceSource =
  | "line_works_message"
  | "line_works_attachment"
  | "notion_page"
  | "figma_node"
  | "url";

export interface TaskReferenceRow {
  id: number;
  taskId: string;
  source: ReferenceSource;
  externalId: string;
  title: string | null;
  excerpt: string | null;
  externalUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  createdBy: string | null;
}

export interface ReferenceAutoFill {
  title: string | null;
  excerpt: string | null;
  externalUrl: string | null;
  metadata: Record<string, unknown> | null;
}

interface TaskReferenceDbRow {
  id: number;
  task_id: string;
  source: string;
  external_id: string;
  title: string | null;
  excerpt: string | null;
  external_url: string | null;
  metadata_json: string | null;
  created_at: string;
  created_by: string | null;
}

function hydrate(row: TaskReferenceDbRow): TaskReferenceRow {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }
  return {
    id: row.id,
    taskId: row.task_id,
    source: row.source as ReferenceSource,
    externalId: row.external_id,
    title: row.title,
    excerpt: row.excerpt,
    externalUrl: row.external_url,
    metadata,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function truncate(value: string | null | undefined, max = 200): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function autoFillReference(
  source: ReferenceSource,
  externalId: string,
): ReferenceAutoFill {
  const db = getDatabase();

  if (source === "line_works_message") {
    const row = db
      .prepare(
        `SELECT channel_id, user_id, content_type, text, issued_at, received_at
         FROM line_works_messages WHERE message_id = ?`,
      )
      .get(externalId) as
      | {
          channel_id: string;
          user_id: string | null;
          content_type: string;
          text: string | null;
          issued_at: string | null;
          received_at: string;
        }
      | undefined;
    if (!row) {
      return { title: null, excerpt: null, externalUrl: null, metadata: null };
    }
    const title = row.text
      ? truncate(row.text, 60)
      : `[${row.content_type}] ${row.channel_id}`;
    return {
      title,
      excerpt: truncate(row.text ?? null, 200),
      externalUrl: null,
      metadata: {
        channelId: row.channel_id,
        userId: row.user_id,
        contentType: row.content_type,
        issuedAt: row.issued_at,
        receivedAt: row.received_at,
      },
    };
  }

  if (source === "line_works_attachment") {
    const id = Number(externalId);
    if (!Number.isInteger(id)) {
      return { title: null, excerpt: null, externalUrl: null, metadata: null };
    }
    const row = db
      .prepare(
        `SELECT a.id, a.message_id, a.file_name, a.file_size, a.mime_type,
                m.channel_id, m.user_id
           FROM line_works_attachments a
      LEFT JOIN line_works_messages m ON m.message_id = a.message_id
          WHERE a.id = ?`,
      )
      .get(id) as
      | {
          id: number;
          message_id: string;
          file_name: string | null;
          file_size: number | null;
          mime_type: string | null;
          channel_id: string | null;
          user_id: string | null;
        }
      | undefined;
    if (!row) {
      return { title: null, excerpt: null, externalUrl: null, metadata: null };
    }
    const excerptParts: string[] = [];
    if (row.mime_type) excerptParts.push(row.mime_type);
    if (row.file_size) excerptParts.push(`${Math.round(row.file_size / 1024)} KB`);
    return {
      title: row.file_name ?? "첨부 파일",
      excerpt: excerptParts.join(" · ") || null,
      externalUrl: null,
      metadata: {
        messageId: row.message_id,
        channelId: row.channel_id,
        userId: row.user_id,
        fileName: row.file_name,
        fileSize: row.file_size,
        mimeType: row.mime_type,
      },
    };
  }

  if (source === "notion_page") {
    const row = db
      .prepare(
        `SELECT title, section_title, parent_title, editor_name, edited_at, page_url
           FROM notion_update_events
          WHERE page_url = ?
          ORDER BY COALESCE(edited_at, received_at) DESC
          LIMIT 1`,
      )
      .get(externalId) as
      | {
          title: string | null;
          section_title: string | null;
          parent_title: string | null;
          editor_name: string | null;
          edited_at: string | null;
          page_url: string;
        }
      | undefined;
    const title = row?.title ?? externalId;
    const excerpt = row
      ? [row.section_title, row.parent_title].filter(Boolean).join(" / ") || null
      : null;
    return {
      title: truncate(title, 200),
      excerpt: truncate(excerpt, 200),
      externalUrl: externalId,
      metadata: row
        ? {
            section: row.section_title,
            parent: row.parent_title,
            editor: row.editor_name,
            editedAt: row.edited_at,
          }
        : null,
    };
  }

  // url
  return {
    title: null,
    excerpt: null,
    externalUrl: externalId,
    metadata: null,
  };
}

export interface CreateReferenceInput {
  taskId: string;
  source: ReferenceSource;
  externalId: string;
  title?: string | null;
  excerpt?: string | null;
  externalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
}

export function createReference(input: CreateReferenceInput): TaskReferenceRow {
  const db = getDatabase();
  const auto = autoFillReference(input.source, input.externalId);

  const title = input.title ?? auto.title;
  const excerpt = input.excerpt ?? auto.excerpt;
  const externalUrl = input.externalUrl ?? auto.externalUrl;
  const metadata = input.metadata ?? auto.metadata;
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  const row = db
    .prepare(
      `
        INSERT INTO task_references (
          task_id, source, external_id, title, excerpt, external_url, metadata_json, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id, source, external_id) DO UPDATE SET
          title = COALESCE(excluded.title, task_references.title),
          excerpt = COALESCE(excluded.excerpt, task_references.excerpt),
          external_url = COALESCE(excluded.external_url, task_references.external_url),
          metadata_json = COALESCE(excluded.metadata_json, task_references.metadata_json)
        RETURNING id, task_id, source, external_id, title, excerpt, external_url,
                  metadata_json, created_at, created_by
      `,
    )
    .get(
      input.taskId,
      input.source,
      input.externalId,
      title,
      excerpt,
      externalUrl,
      metadataJson,
      input.createdBy ?? null,
    ) as unknown as TaskReferenceDbRow | undefined;

  if (!row) {
    throw new Error("Failed to upsert task reference");
  }
  return hydrate(row);
}

export function deleteReference(id: number, taskId?: string): boolean {
  const db = getDatabase();
  if (taskId) {
    const result = db
      .prepare(`DELETE FROM task_references WHERE id = ? AND task_id = ?`)
      .run(id, taskId);
    return result.changes > 0;
  }
  const result = db.prepare(`DELETE FROM task_references WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function listReferencesByTaskIds(taskIds: string[]): Map<string, TaskReferenceRow[]> {
  const result = new Map<string, TaskReferenceRow[]>();
  if (taskIds.length === 0) {
    return result;
  }
  const db = getDatabase();
  const placeholders = taskIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
        SELECT id, task_id, source, external_id, title, excerpt, external_url,
               metadata_json, created_at, created_by
        FROM task_references
        WHERE task_id IN (${placeholders})
        ORDER BY created_at DESC
      `,
    )
    .all(...taskIds) as unknown as TaskReferenceDbRow[];
  for (const row of rows) {
    const hydrated = hydrate(row);
    const list = result.get(hydrated.taskId) ?? [];
    list.push(hydrated);
    result.set(hydrated.taskId, list);
  }
  return result;
}

export function listReferencesForTask(taskId: string): TaskReferenceRow[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, task_id, source, external_id, title, excerpt, external_url,
              metadata_json, created_at, created_by
         FROM task_references
        WHERE task_id = ?
        ORDER BY created_at DESC`,
    )
    .all(taskId) as unknown as TaskReferenceDbRow[];
  return rows.map(hydrate);
}
