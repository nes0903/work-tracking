import { getDatabase } from "./postgres-db";
import { extractLinksFromText } from "./line-works-bot";

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

export async function upsertMessage(input: InsertMessageInput): Promise<void> {
  const db = getDatabase();
  await db
    .prepare(
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
    )
    .run(
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
  storageBucket: string;
  storagePath: string;
}

export interface AttachmentRow {
  id: number;
  messageId: string;
  fileId: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  storageBucket: string;
  storagePath: string;
  uploadedAt: string | null;
}

export async function findAttachmentByFileId(
  fileId: string,
  messageId: string,
): Promise<AttachmentRow | null> {
  const db = getDatabase();
  const row = await db
    .prepare(
      `SELECT id, message_id, file_id, file_name, file_size, mime_type,
              storage_bucket, storage_path, uploaded_at
         FROM line_works_attachments
        WHERE file_id = ? AND message_id = ?
        LIMIT 1`,
    )
    .get(fileId, messageId);
  if (!row) return null;
  return {
    id: row.id,
    messageId: row.message_id,
    fileId: row.file_id,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    uploadedAt: row.uploaded_at,
  };
}

export async function attachmentStoragePathExists(
  bucket: string,
  path: string,
): Promise<boolean> {
  const db = getDatabase();
  const row = await db
    .prepare(
      `SELECT 1 AS found FROM line_works_attachments
        WHERE storage_bucket = ? AND storage_path = ?
        LIMIT 1`,
    )
    .get(bucket, path);
  return !!row;
}

export async function insertAttachment(
  input: InsertAttachmentInput,
): Promise<AttachmentRow> {
  const db = getDatabase();
  const row = await db
    .prepare(
      `
        INSERT INTO line_works_attachments (
          message_id, file_id, file_name, file_size, mime_type,
          storage_bucket, storage_path, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(storage_bucket, storage_path) DO UPDATE SET
          message_id = excluded.message_id,
          file_id = excluded.file_id,
          file_name = excluded.file_name,
          file_size = excluded.file_size,
          mime_type = excluded.mime_type,
          uploaded_at = datetime('now')
        RETURNING
          id, message_id, file_id, file_name, file_size, mime_type,
          storage_bucket, storage_path, uploaded_at
      `,
    )
    .get(
      input.messageId,
      input.fileId,
      input.fileName,
      input.fileSize,
      input.mimeType,
      input.storageBucket,
      input.storagePath,
    );

  if (!row) {
    throw new Error("Failed to insert attachment row");
  }

  return hydrateAttachment(row);
}

export async function insertLinks(
  messageId: string,
  urls: string[],
): Promise<void> {
  if (urls.length === 0) {
    return;
  }
  const db = getDatabase();
  const existingRows = await db
    .prepare(`SELECT url FROM line_works_links WHERE message_id = ?`)
    .all(messageId);
  const seen = new Set(existingRows.map((row) => row.url.toLowerCase()));
  const statement = db.prepare(
    `INSERT INTO line_works_links (message_id, url) VALUES (?, ?)`,
  );
  for (const url of urls) {
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    await statement.run(messageId, url);
  }
}

export async function getLineWorksLinkById(
  id: number,
): Promise<{ id: number; messageId: string; url: string } | null> {
  const db = getDatabase();
  const row = await db
    .prepare(`SELECT id, message_id, url FROM line_works_links WHERE id = ?`)
    .get(id);
  return row ? { id: row.id, messageId: row.message_id, url: row.url } : null;
}

export async function getAttachmentById(
  id: number,
): Promise<AttachmentRow | null> {
  const db = getDatabase();
  const row = await db
    .prepare(
      `
        SELECT id, message_id, file_id, file_name, file_size, mime_type,
               storage_bucket, storage_path, uploaded_at
        FROM line_works_attachments
        WHERE id = ?
      `,
    )
    .get(id);
  if (!row) {
    return null;
  }
  return hydrateAttachment(row);
}

export async function listAllAttachments(): Promise<AttachmentRow[]> {
  const db = getDatabase();
  const rows = await db
    .prepare(
      `
        SELECT id, message_id, file_id, file_name, file_size, mime_type,
               storage_bucket, storage_path, uploaded_at
        FROM line_works_attachments
        ORDER BY uploaded_at DESC
      `,
    )
    .all();
  return rows.map(hydrateAttachment);
}

export async function deleteAttachmentRow(id: number): Promise<boolean> {
  const db = getDatabase();
  const result = await db
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

export async function getChannelMeta(
  channelId: string,
): Promise<ChannelMetaRow | null> {
  const db = getDatabase();
  const row = await db
    .prepare(
      `SELECT channel_id, title, channel_type, user_id, last_fetched_at
         FROM line_works_channels WHERE channel_id = ?`,
    )
    .get(channelId);
  return row ? hydrateChannelMeta(row) : null;
}

export async function listChannelMeta(
  channelIds?: string[],
): Promise<ChannelMetaRow[]> {
  const db = getDatabase();
  if (channelIds && channelIds.length > 0) {
    const placeholders = channelIds.map(() => "?").join(",");
    const rows = await db
      .prepare(
        `SELECT channel_id, title, channel_type, user_id, last_fetched_at
           FROM line_works_channels WHERE channel_id IN (${placeholders})`,
      )
      .all(...channelIds);
    return rows.map(hydrateChannelMeta);
  }
  const rows = await db
    .prepare(
      `SELECT channel_id, title, channel_type, user_id, last_fetched_at
         FROM line_works_channels`,
    )
    .all();
  return rows.map(hydrateChannelMeta);
}

export async function upsertChannelMeta(input: {
  channelId: string;
  title: string | null;
  channelType: string | null;
  userId: string | null;
}): Promise<void> {
  const db = getDatabase();
  await db
    .prepare(
      `
      INSERT INTO line_works_channels (channel_id, title, channel_type, user_id, last_fetched_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(channel_id) DO UPDATE SET
        title = excluded.title,
        channel_type = excluded.channel_type,
        user_id = excluded.user_id,
        last_fetched_at = excluded.last_fetched_at
    `,
    )
    .run(input.channelId, input.title, input.channelType, input.userId);
}

interface AttachmentDbRow {
  id: number;
  message_id: string;
  file_id: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  storage_bucket: string;
  storage_path: string;
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
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
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
  savedSiteLinkId: number | null;
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
  saved_site_link_id: number | null;
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

export async function listArchive(options?: {
  channelId?: string;
  page?: number;
  perPage?: number;
}): Promise<ArchiveResult> {
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

  const totalRow = await db
    .prepare(
      `
        SELECT COUNT(*) AS c
        FROM line_works_messages m
        ${useChannelFilter ? "WHERE m.channel_id = ?" : ""}
      `,
    )
    .get(...channelParams);
  const total = Number(totalRow?.c ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const messages = await db
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
    .all(...channelParams, perPage, offset);

  const messageIds = messages.map((row) => row.message_id);

  let attachments: AttachmentListRow[] = [];
  let links: LinkListRow[] = [];

  if (messageIds.length > 0) {
    for (const message of messages) {
      await insertLinks(message.message_id, extractLinksFromText(message.text));
    }

    const placeholders = messageIds.map(() => "?").join(",");
    attachments = await db
      .prepare(
        `
          SELECT id, message_id, file_name, file_size, mime_type
          FROM line_works_attachments
          WHERE message_id IN (${placeholders})
          ORDER BY id ASC
        `,
      )
      .all(...messageIds);

    links = await db
      .prepare(
        `
          SELECT id, message_id, url
          FROM line_works_links
          WHERE message_id IN (${placeholders})
          ORDER BY id ASC
        `,
      )
      .all(...messageIds);
  }

  if (links.length > 0) {
    const linkUrls = Array.from(new Set(links.map((row) => row.url)));
    const placeholders = linkUrls.map(() => "?").join(",");
    const savedRows = await db
      .prepare(
        `
          SELECT url, MIN(id) AS id
            FROM site_links
           WHERE url IN (${placeholders})
        GROUP BY url
        `,
      )
      .all(...linkUrls);
    const savedByUrl = new Map(
      savedRows.map((row) => [row.url, Number(row.id)]),
    );
    links = links.map((row) => ({
      ...row,
      saved_site_link_id: savedByUrl.get(row.url) ?? null,
    }));
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
    list.push({
      id: row.id,
      url: row.url,
      savedSiteLinkId: row.saved_site_link_id,
    });
    linksByMessage.set(row.message_id, list);
  }

  // channel meta 한꺼번에 로드
  const channelIdsToResolve = Array.from(
    new Set(messages.map((row) => row.channel_id)),
  );
  const metaMap = new Map<string, ChannelMetaRow>();
  for (const meta of await listChannelMeta(channelIdsToResolve)) {
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

  const channelsRaw = await db
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
    .all();

  const channels: ArchiveChannelSummary[] = channelsRaw.map((row) => ({
    channelId: row.channel_id,
    title: row.title,
    channelType: row.channel_type,
    count: Number(row.count),
  }));

  const lastRow = await db
    .prepare(`SELECT MAX(received_at) AS last FROM line_works_messages`)
    .get();

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
