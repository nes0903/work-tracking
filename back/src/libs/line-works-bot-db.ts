import { getDatabase } from "@libs/sqlite-db";

export interface InsertMessageInput {
  messageId: string;
  channelId: string;
  userId: string | null;
  domainId: string | null;
  contentType: string;
  text: string | null;
  issuedAt: string | null;
  rawJson: string;
}

export function upsertMessage(input: InsertMessageInput): void {
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO line_works_messages (
        message_id, channel_id, user_id, domain_id, content_type, text, issued_at, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        user_id = excluded.user_id,
        domain_id = excluded.domain_id,
        content_type = excluded.content_type,
        text = excluded.text,
        issued_at = excluded.issued_at,
        raw_json = excluded.raw_json
    `,
  ).run(
    input.messageId,
    input.channelId,
    input.userId,
    input.domainId,
    input.contentType,
    input.text,
    input.issuedAt,
    input.rawJson,
  );
}

export interface InsertAttachmentInput {
  messageId: string;
  fileId: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  s3Bucket: string;
  s3Key: string;
}

export interface AttachmentRow {
  id: number;
  messageId: string;
  fileId: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  s3Bucket: string;
  s3Key: string;
  uploadedAt: string | null;
}

export function insertAttachment(input: InsertAttachmentInput): AttachmentRow {
  const db = getDatabase();
  const row = db
    .prepare(
      `
        INSERT INTO line_works_attachments (
          message_id, file_id, file_name, file_size, mime_type,
          s3_bucket, s3_key, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(s3_bucket, s3_key) DO UPDATE SET
          message_id = excluded.message_id,
          file_id = excluded.file_id,
          file_name = excluded.file_name,
          file_size = excluded.file_size,
          mime_type = excluded.mime_type,
          uploaded_at = datetime('now')
        RETURNING
          id, message_id, file_id, file_name, file_size, mime_type,
          s3_bucket, s3_key, uploaded_at
      `,
    )
    .get(
      input.messageId,
      input.fileId,
      input.fileName,
      input.fileSize,
      input.mimeType,
      input.s3Bucket,
      input.s3Key,
    ) as unknown as AttachmentDbRow | undefined;

  if (!row) {
    throw new Error("Failed to insert attachment row");
  }

  return hydrateAttachment(row);
}

export function insertLinks(messageId: string, urls: string[]): void {
  if (urls.length === 0) {
    return;
  }
  const db = getDatabase();
  const statement = db.prepare(
    `INSERT INTO line_works_links (message_id, url) VALUES (?, ?)`,
  );
  for (const url of urls) {
    statement.run(messageId, url);
  }
}

export function getAttachmentById(id: number): AttachmentRow | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
        SELECT id, message_id, file_id, file_name, file_size, mime_type,
               s3_bucket, s3_key, uploaded_at
        FROM line_works_attachments
        WHERE id = ?
      `,
    )
    .get(id) as AttachmentDbRow | undefined;
  if (!row) {
    return null;
  }
  return hydrateAttachment(row);
}

export function listAllAttachments(): AttachmentRow[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT id, message_id, file_id, file_name, file_size, mime_type,
               s3_bucket, s3_key, uploaded_at
        FROM line_works_attachments
        ORDER BY uploaded_at DESC
      `,
    )
    .all() as unknown as AttachmentDbRow[];
  return rows.map(hydrateAttachment);
}

export function deleteAttachmentRow(id: number): boolean {
  const db = getDatabase();
  const result = db
    .prepare(`DELETE FROM line_works_attachments WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}

interface AttachmentDbRow {
  id: number;
  message_id: string;
  file_id: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  s3_bucket: string;
  s3_key: string;
  uploaded_at: string | null;
}

function hydrateAttachment(row: AttachmentDbRow): AttachmentRow {
  return {
    id: row.id,
    messageId: row.message_id,
    fileId: row.file_id,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    s3Bucket: row.s3_bucket,
    s3Key: row.s3_key,
    uploadedAt: row.uploaded_at,
  };
}

export interface ArchiveAttachment {
  id: number;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
}

export interface ArchiveLink {
  id: number;
  url: string;
}

export interface ArchiveMessage {
  messageId: string;
  channelId: string;
  userId: string | null;
  contentType: string;
  text: string | null;
  issuedAt: string | null;
  receivedAt: string;
  attachments: ArchiveAttachment[];
  links: ArchiveLink[];
}

export interface ArchiveChannelSummary {
  channelId: string;
  count: number;
}

export interface ArchiveResult {
  items: ArchiveMessage[];
  channels: ArchiveChannelSummary[];
  lastReceivedAt: string | null;
}

interface MessageDbRow {
  message_id: string;
  channel_id: string;
  user_id: string | null;
  content_type: string;
  text: string | null;
  issued_at: string | null;
  received_at: string;
}

interface AttachmentListRow {
  id: number;
  message_id: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
}

interface LinkListRow {
  id: number;
  message_id: string;
  url: string;
}

interface ChannelSummaryRow {
  channel_id: string;
  count: number;
}

export function listArchive(options?: {
  channelId?: string;
  limit?: number;
}): ArchiveResult {
  const db = getDatabase();
  const rawLimit = options?.limit ?? 50;
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200);

  const useChannelFilter = Boolean(options?.channelId);
  const channelParams = useChannelFilter ? [options!.channelId!] : [];

  const messages = db
    .prepare(
      `
        SELECT message_id, channel_id, user_id, content_type, text, issued_at, received_at
        FROM line_works_messages
        ${useChannelFilter ? "WHERE channel_id = ?" : ""}
        ORDER BY COALESCE(issued_at, received_at) DESC
        LIMIT ?
      `,
    )
    .all(...channelParams, limit) as unknown as MessageDbRow[];

  const messageIds = messages.map((row) => row.message_id);

  let attachments: AttachmentListRow[] = [];
  let links: LinkListRow[] = [];

  if (messageIds.length > 0) {
    const placeholders = messageIds.map(() => "?").join(",");
    attachments = db
      .prepare(
        `
          SELECT id, message_id, file_name, file_size, mime_type
          FROM line_works_attachments
          WHERE message_id IN (${placeholders})
          ORDER BY id ASC
        `,
      )
      .all(...messageIds) as unknown as AttachmentListRow[];

    links = db
      .prepare(
        `
          SELECT id, message_id, url
          FROM line_works_links
          WHERE message_id IN (${placeholders})
          ORDER BY id ASC
        `,
      )
      .all(...messageIds) as unknown as LinkListRow[];
  }

  const attachmentsByMessage = new Map<string, ArchiveAttachment[]>();
  for (const row of attachments) {
    const list = attachmentsByMessage.get(row.message_id) ?? [];
    list.push({
      id: row.id,
      fileName: row.file_name,
      fileSize: row.file_size,
      mimeType: row.mime_type,
    });
    attachmentsByMessage.set(row.message_id, list);
  }

  const linksByMessage = new Map<string, ArchiveLink[]>();
  for (const row of links) {
    const list = linksByMessage.get(row.message_id) ?? [];
    list.push({ id: row.id, url: row.url });
    linksByMessage.set(row.message_id, list);
  }

  const items: ArchiveMessage[] = messages.map((row) => ({
    messageId: row.message_id,
    channelId: row.channel_id,
    userId: row.user_id,
    contentType: row.content_type,
    text: row.text,
    issuedAt: row.issued_at,
    receivedAt: row.received_at,
    attachments: attachmentsByMessage.get(row.message_id) ?? [],
    links: linksByMessage.get(row.message_id) ?? [],
  }));

  const channelsRaw = db
    .prepare(
      `
        SELECT channel_id, COUNT(*) AS count
        FROM line_works_messages
        GROUP BY channel_id
        ORDER BY count DESC
      `,
    )
    .all() as unknown as ChannelSummaryRow[];

  const channels: ArchiveChannelSummary[] = channelsRaw.map((row) => ({
    channelId: row.channel_id,
    count: row.count,
  }));

  const lastRow = db
    .prepare(`SELECT MAX(received_at) AS last FROM line_works_messages`)
    .get() as { last: string | null } | undefined;

  return {
    items,
    channels,
    lastReceivedAt: lastRow?.last ?? null,
  };
}
