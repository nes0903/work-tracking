import { Injectable, Logger } from "@nestjs/common";
import {
  extractLinksFromText,
  fetchAttachmentStream,
  fetchBotScopedUserName,
  fetchChannelInfo,
  isChannelAllowed,
  loadBotConfig,
  verifyCallbackSignature,
  type BotConfig,
} from "@libs/line-works-bot";
import {
  attachmentStoragePathExists,
  findAttachmentByFileId,
  getChannelMeta,
  insertAttachment,
  insertLinks,
  upsertChannelMeta,
  upsertMessage,
} from "@libs/line-works-bot-db";
import { getUser, upsertUserName } from "@libs/users-db";
import { emitFeedUpdate } from "@libs/feed-events";
import {
  buildAttachmentObjectPath,
  loadStorageConfig,
  putAttachmentObject,
  resolveUniqueAttachmentPath,
} from "@libs/supabase-storage";

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
      return {
        status: 200,
        body: { ok: true, ignored: true, reason: "non-message event" },
      };
    }

    const channelId = resolveChannelId(event);
    if (!channelId || !isChannelAllowed(botConfig, channelId)) {
      return {
        status: 200,
        body: { ok: true, ignored: true, reason: "channel not in allowlist" },
      };
    }

    // 채널 메타 캐시가 없으면 비동기로 fetch (응답 지연 최소화)
    void this.ensureChannelMeta(botConfig, channelId, event).catch((err) => {
      this.logger.warn(`channel meta fetch failed: ${(err as Error).message}`);
    });

    // 발신자 이름 캐시
    const userId = event.source?.userId;
    if (userId) {
      void this.ensureUserName(botConfig, userId).catch((err) => {
        this.logger.warn(`user name fetch failed: ${(err as Error).message}`);
      });
    }

    try {
      const stored = await this.persistEvent(
        botConfig,
        rawBody,
        event,
        channelId,
      );
      await emitFeedUpdate("line-works");
      return { status: 200, body: { ok: true, ...stored } };
    } catch (err) {
      this.logger.error("Failed to persist LINE WORKS event", err as Error);
      return {
        status: 500,
        body: { ok: false, error: "Failed to persist event" },
      };
    }
  }

  private async ensureUserName(
    botConfig: BotConfig,
    userId: string,
  ): Promise<void> {
    const existing = await getUser(userId);
    if (existing?.userName) return;
    const name = await fetchBotScopedUserName(botConfig, userId);
    if (name) {
      await upsertUserName(userId, name);
    }
  }

  private async ensureChannelMeta(
    botConfig: BotConfig,
    channelId: string,
    event: LineWorksCallbackEvent,
  ): Promise<void> {
    const existing = await getChannelMeta(channelId);
    if (existing?.title) {
      return;
    }

    if (channelId.startsWith("dm:")) {
      const userId = channelId.slice(3);
      const name = await fetchBotScopedUserName(botConfig, userId);
      await upsertChannelMeta({
        channelId,
        title: name,
        channelType: "SINGLE_USER",
        userId,
      });
      return;
    }

    const info = await fetchChannelInfo(botConfig, channelId);
    await upsertChannelMeta({
      channelId,
      title: info?.title ?? existing?.title ?? null,
      channelType: info?.channelType ?? existing?.channelType ?? null,
      userId: event.source?.userId ?? existing?.userId ?? null,
    });
  }

  private async persistEvent(
    botConfig: BotConfig,
    rawBody: string,
    event: LineWorksCallbackEvent,
    channelId: string,
  ): Promise<Record<string, unknown>> {
    const messageId = this.resolveMessageId(event, rawBody, channelId);
    const contentType = event.content?.type ?? "unknown";
    const text = event.content?.text ?? null;

    await upsertMessage({
      messageId,
      channelId,
      userId: event.source?.userId ?? null,
      domainId:
        event.source?.domainId !== undefined
          ? String(event.source.domainId)
          : null,
      contentType,
      text,
      issuedAt: event.issuedTime ?? null,
      rawJson: rawBody,
    });

    let linkCount = 0;
    if (text) {
      const urls = extractLinksFromText(text);
      await insertLinks(messageId, urls);
      linkCount = urls.length;
    }

    const fileId = event.content?.fileId ?? event.content?.resourceId ?? null;
    const downloadable =
      fileId !== null &&
      ["image", "file", "video", "audio"].includes(contentType);

    let attachmentId: number | null = null;
    if (downloadable && fileId) {
      const uploaded = await this.uploadAttachment(
        botConfig,
        messageId,
        event,
        fileId,
        channelId,
      );
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
    channelId: string,
  ): Promise<{ id: number } | null> {
    const storageConfig = loadStorageConfig();

    // 멱등: 같은 (fileId, messageId) 로 이미 업로드한 이력이 있으면 재업로드 skip
    const existing = await findAttachmentByFileId(fileId, messageId);
    if (existing) {
      return { id: existing.id };
    }

    const stream = await fetchAttachmentStream(botConfig, fileId);
    const fileName =
      event.content?.fileName ?? stream.fileName ?? `${fileId}.bin`;
    const channelMeta = await getChannelMeta(channelId);
    const basePath = buildAttachmentObjectPath({
      prefix: storageConfig.prefix,
      channelId,
      channelName: channelMeta?.title ?? null,
      issuedAt: event.issuedTime,
      fileName,
    });
    // 같은 날짜·같은 파일명 충돌 시 "(1)", "(2)" 접미사
    const path = await resolveUniqueAttachmentPath(basePath, (candidate) =>
      attachmentStoragePathExists(storageConfig.bucket, candidate),
    );

    const { bucket, path: savedPath } = await putAttachmentObject({
      path,
      body: stream.body,
      contentType: stream.contentType ?? undefined,
    });

    const inserted = await insertAttachment({
      messageId,
      fileId,
      fileName,
      fileSize: event.content?.fileSize ?? stream.contentLength ?? null,
      mimeType: stream.contentType,
      storageBucket: bucket,
      storagePath: savedPath,
    });

    return { id: inserted.id };
  }

  private resolveMessageId(
    event: LineWorksCallbackEvent,
    rawBody: string,
    channelId: string,
  ): string {
    const candidate =
      (event as { messageId?: string }).messageId ??
      (event as { requestId?: string }).requestId;
    if (candidate) {
      return String(candidate);
    }
    const userId = event.source?.userId ?? "unknown";
    const issuedAt = event.issuedTime ?? new Date().toISOString();
    return `${channelId}:${userId}:${issuedAt}:${rawBody.length}`;
  }
}

function resolveChannelId(event: LineWorksCallbackEvent): string | undefined {
  const direct = event.source?.channelId;
  if (direct) {
    return direct;
  }
  // 1:1 direct chats between a user and the bot come without channelId.
  // Use a synthetic stable ID so we can allowlist and group them in the UI.
  const userId = event.source?.userId;
  if (userId) {
    return `dm:${userId}`;
  }
  return undefined;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
