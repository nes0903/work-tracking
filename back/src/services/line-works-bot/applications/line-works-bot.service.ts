import { Injectable, Logger } from "@nestjs/common";
import {
  extractLinksFromText,
  fetchAttachmentStream,
  isChannelAllowed,
  loadBotConfig,
  verifyCallbackSignature,
  type BotConfig,
} from "@libs/line-works-bot";
import {
  insertAttachment,
  insertLinks,
  upsertMessage,
} from "@libs/line-works-bot-db";
import {
  buildAttachmentObjectKey,
  loadS3Config,
  putAttachmentObject,
} from "@libs/s3";

interface CallbackSource {
  userId?: string;
  channelId?: string;
  domainId?: number | string;
}

interface CallbackContent {
  type?: string;
  text?: string;
  fileId?: string;
  resourceId?: string;
  fileName?: string;
  fileSize?: number;
}

export interface LineWorksCallbackEvent {
  type?: string;
  source?: CallbackSource;
  issuedTime?: string;
  content?: CallbackContent;
}

export interface LineWorksCallbackResult {
  status: number;
  body: Record<string, unknown>;
}

@Injectable()
export class LineWorksBotService {
  private readonly logger = new Logger(LineWorksBotService.name);

  async handleWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<LineWorksCallbackResult> {
    const botConfig = loadBotConfig();
    if (!botConfig) {
      return {
        status: 503,
        body: { ok: false, error: "LINE WORKS bot is not configured" },
      };
    }

    if (!verifyCallbackSignature(rawBody, signature, botConfig.botSecret)) {
      return { status: 401, body: { ok: false, error: "Invalid signature" } };
    }

    const event = safeJsonParse(rawBody) as LineWorksCallbackEvent | null;
    if (!event || typeof event !== "object") {
      return { status: 400, body: { ok: false, error: "Invalid JSON body" } };
    }

    if (event.type !== "message") {
      return { status: 200, body: { ok: true, ignored: true, reason: "non-message event" } };
    }

    const channelId = event.source?.channelId;
    if (!channelId || !isChannelAllowed(botConfig, channelId)) {
      return {
        status: 200,
        body: { ok: true, ignored: true, reason: "channel not in allowlist" },
      };
    }

    try {
      const stored = await this.persistEvent(botConfig, rawBody, event);
      return { status: 200, body: { ok: true, ...stored } };
    } catch (err) {
      this.logger.error("Failed to persist LINE WORKS event", err as Error);
      return { status: 500, body: { ok: false, error: "Failed to persist event" } };
    }
  }

  private async persistEvent(
    botConfig: BotConfig,
    rawBody: string,
    event: LineWorksCallbackEvent,
  ): Promise<Record<string, unknown>> {
    const messageId = this.resolveMessageId(event, rawBody);
    const channelId = event.source?.channelId!;
    const contentType = event.content?.type ?? "unknown";
    const text = event.content?.text ?? null;

    upsertMessage({
      messageId,
      channelId,
      userId: event.source?.userId ?? null,
      domainId:
        event.source?.domainId !== undefined ? String(event.source.domainId) : null,
      contentType,
      text,
      issuedAt: event.issuedTime ?? null,
      rawJson: rawBody,
    });

    let linkCount = 0;
    if (text) {
      const urls = extractLinksFromText(text);
      insertLinks(messageId, urls);
      linkCount = urls.length;
    }

    const fileId = event.content?.fileId ?? event.content?.resourceId ?? null;
    const downloadable = fileId && (contentType === "image" || contentType === "file");

    let attachmentId: number | null = null;
    if (downloadable) {
      const uploaded = await this.uploadAttachment(botConfig, messageId, event, fileId);
      attachmentId = uploaded?.id ?? null;
    }

    return {
      messageId,
      channelId,
      contentType,
      linkCount,
      attachmentId,
    };
  }

  private async uploadAttachment(
    botConfig: BotConfig,
    messageId: string,
    event: LineWorksCallbackEvent,
    fileId: string,
  ): Promise<{ id: number } | null> {
    const s3Config = loadS3Config();
    if (!s3Config) {
      this.logger.warn("S3 is not configured; skipping attachment download");
      return null;
    }

    const stream = await fetchAttachmentStream(botConfig, fileId);
    const fileName = event.content?.fileName ?? stream.fileName ?? `${fileId}.bin`;
    const key = buildAttachmentObjectKey(s3Config.prefix, fileId, fileName);

    const { bucket, key: savedKey } = await putAttachmentObject({
      key,
      body: stream.body,
      contentType: stream.contentType ?? undefined,
      contentLength:
        event.content?.fileSize ?? stream.contentLength ?? undefined,
      metadata: {
        messageId,
        fileId,
      },
    });

    const inserted = insertAttachment({
      messageId,
      fileId,
      fileName,
      fileSize: event.content?.fileSize ?? stream.contentLength ?? null,
      mimeType: stream.contentType,
      s3Bucket: bucket,
      s3Key: savedKey,
    });

    return { id: inserted.id };
  }

  private resolveMessageId(event: LineWorksCallbackEvent, rawBody: string): string {
    const candidate =
      (event as { messageId?: string }).messageId ??
      (event as { requestId?: string }).requestId;
    if (candidate) {
      return String(candidate);
    }
    const channelId = event.source?.channelId ?? "unknown";
    const userId = event.source?.userId ?? "unknown";
    const issuedAt = event.issuedTime ?? new Date().toISOString();
    return `${channelId}:${userId}:${issuedAt}:${rawBody.length}`;
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
