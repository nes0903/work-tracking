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

export function findAttachmentByFileId(
  fileId: string,
  messageId: string,
): AttachmentRow | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT id, message_id, file_id, file_name, file_size, mime_type,
              s3_bucket, s3_key, uploaded_at
         FROM line_works_attachments
        WHERE file_id = ? AND message_id = ?
        LIMIT 1`,
    )
    .get(fileId, messageId) as unknown as AttachmentDbRow | undefined;
  if (!row) return null;
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

export function attachmentS3KeyExists(bucket: string, key: string): boolean {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT 1 AS found FROM line_works_attachments
        WHERE s3_bucket = ? AND s3_key = ?
        LIMIT 1`,
    )
    .get(bucket, key) as { found: number } | undefined;
  return !!row;
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

export interface ChannelMetaRow {
  channelId: string;
  title: string | null;
  channelType: string | null;
  userId: string | null;
  lastFetchedAt: string | null;
}

interface ChannelMetaDbRow {
  channel_id: string;
  title: string | null;
  channel_type: string | null;
  user_id: string | null;
  last_fetched_at: string | null;
}

function hydrateChannelMeta(row: ChannelMetaDbRow): ChannelMetaRow {
  return {
    channelId: row.channel_id,
    title: row.title,
    channelType: row.channel_type,
    userId: row.user_id,
    lastFetchedAt: row.last_fetched_at,
  };
}

export function getChannelMeta(channelId: string): ChannelMetaRow | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT channel_id, title, channel_type, user_id, last_fetched_at
         FROM line_works_channels WHERE channel_id = ?`,
    )
    .get(channelId) as ChannelMetaDbRow | undefined;
  return row ? hydrateChannelMeta(row) : null;
}

export function listChannelMeta(channelIds?: string[]): ChannelMetaRow[] {
  const db = getDatabase();
  if (channelIds && channelIds.length > 0) {
    const placeholders = channelIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT channel_id, title, channel_type, user_id, last_fetched_at
           FROM line_works_channels WHERE channel_id IN (${placeholders})`,
      )
      .all(...channelIds) as unknown as ChannelMetaDbRow[];
    return rows.map(hydrateChannelMeta);
  }
  const rows = db
    .prepare(
      `SELECT channel_id, title, channel_type, user_id, last_fetched_at
         FROM line_works_channels`,
    )
    .all() as unknown as ChannelMetaDbRow[];
  return rows.map(hydrateChannelMeta);
}

export function upsertChannelMeta(input: {
  channelId: string;
  title: string | null;
  channelType: string | null;
  userId: string | null;
}): void {
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO line_works_channels (channel_id, title, channel_type, user_id, last_fetched_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(channel_id) DO UPDATE SET
        title = excluded.title,
        channel_type = excluded.channel_type,
        user_id = excluded.user_id,
        last_fetched_at = excluded.last_fetched_at
    `,
  ).run(input.channelId, input.title, input.channelType, input.userId);
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
  channelTitle: string | null;
  channelType: string | null;
  userId: string | null;
  userName: string | null;
  contentType: string;
  text: string | null;
  issuedAt: string | null;
  receivedAt: string;
  attachments: ArchiveAttachment[];
  links: ArchiveLink[];
}

export interface ArchiveChannelSummary {
  channelId: string;
  title: string | null;
  channelType: string | null;
  count: number;
}

export interface ArchiveResult {
  items: ArchiveMessage[];
  channels: ArchiveChannelSummary[];
  lastReceivedAt: string | null;
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
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

interface ChannelSummaryRowWithMeta {
  channel_id: string;
  title: string | null;
  channel_type: string | null;
  count: number;
}

export function listArchive(options?: {
  channelId?: string;
  page?: number;
  perPage?: number;
}): ArchiveResult {
  const db = getDatabase();
  const rawPage = options?.page ?? 1;
  const rawPerPage = options?.perPage ?? 50;
  const page = Math.max(Number.isFinite(rawPage) ? Math.floor(rawPage) : 1, 1);
  const perPage = Math.min(
    Math.max(Number.isFinite(rawPerPage) ? Math.floor(rawPerPage) : 50, 1),
    200,
  );
  const offset = (page - 1) * perPage;

  const useChannelFilter = Boolean(options?.channelId);
  const channelParams = useChannelFilter ? [options!.channelId!] : [];

  const totalRow = db
    .prepare(
      `
        SELECT COUNT(*) AS c
        FROM line_works_messages m
        ${useChannelFilter ? "WHERE m.channel_id = ?" : ""}
      `,
    )
    .get(...channelParams) as { c: number } | undefined;
  const total = totalRow?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const messages = db
    .prepare(
      `
        SELECT m.message_id, m.channel_id, m.user_id, m.content_type,
               m.text, m.issued_at, m.received_at,
               u.user_name AS user_name
        FROM line_works_messages m
        LEFT JOIN users u ON u.user_id = m.user_id
        ${useChannelFilter ? "WHERE m.channel_id = ?" : ""}
        ORDER BY COALESCE(m.issued_at, m.received_at) DESC
        LIMIT ? OFFSET ?
      `,
    )
    .all(...channelParams, perPage, offset) as unknown as (MessageDbRow & {
    user_name: string | null;
  })[];

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

  // channel meta 한꺼번에 로드
  const channelIdsToResolve = Array.from(
    new Set(messages.map((row) => row.channel_id)),
  );
  const metaMap = new Map<string, ChannelMetaRow>();
  for (const meta of listChannelMeta(channelIdsToResolve)) {
    metaMap.set(meta.channelId, meta);
  }

  const items: ArchiveMessage[] = messages.map((row) => {
    const meta = metaMap.get(row.channel_id);
    return {
      messageId: row.message_id,
      channelId: row.channel_id,
      channelTitle: meta?.title ?? null,
      channelType: meta?.channelType ?? null,
      userId: row.user_id,
      userName: row.user_name ?? null,
      contentType: row.content_type,
      text: row.text,
      issuedAt: row.issued_at,
      receivedAt: row.received_at,
      attachments: attachmentsByMessage.get(row.message_id) ?? [],
      links: linksByMessage.get(row.message_id) ?? [],
    };
  });

  const channelsRaw = db
    .prepare(
      `
        SELECT m.channel_id, COUNT(*) AS count,
               c.title, c.channel_type
        FROM line_works_messages m
        LEFT JOIN line_works_channels c ON c.channel_id = m.channel_id
        GROUP BY m.channel_id, c.title, c.channel_type
        ORDER BY count DESC
      `,
    )
    .all() as unknown as ChannelSummaryRowWithMeta[];

  const channels: ArchiveChannelSummary[] = channelsRaw.map((row) => ({
    channelId: row.channel_id,
    title: row.title,
    channelType: row.channel_type,
    count: row.count,
  }));

  const lastRow = db
    .prepare(`SELECT MAX(received_at) AS last FROM line_works_messages`)
    .get() as { last: string | null } | undefined;

  return {
    items,
    channels,
    lastReceivedAt: lastRow?.last ?? null,
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
