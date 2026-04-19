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
