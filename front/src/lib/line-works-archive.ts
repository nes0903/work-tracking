export interface LineWorksArchiveAttachment {
  id: number;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
}

export interface LineWorksArchiveLink {
  id: number;
  url: string;
}

export interface LineWorksArchiveMessage {
  messageId: string;
  channelId: string;
  userId: string | null;
  contentType: string;
  text: string | null;
  issuedAt: string | null;
  receivedAt: string;
  attachments: LineWorksArchiveAttachment[];
  links: LineWorksArchiveLink[];
}

export interface LineWorksArchiveChannelSummary {
  channelId: string;
  count: number;
}

export interface LineWorksArchive {
  items: LineWorksArchiveMessage[];
  channels: LineWorksArchiveChannelSummary[];
  lastReceivedAt: string | null;
}

export function emptyLineWorksArchive(): LineWorksArchive {
  return { items: [], channels: [], lastReceivedAt: null };
}

export async function fetchLineWorksArchive(
  channelId?: string | null,
): Promise<LineWorksArchive> {
  const query = channelId ? `?channelId=${encodeURIComponent(channelId)}` : "";
  const response = await fetch(`/api/line-works-archive${query}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    ok: boolean;
    items?: LineWorksArchiveMessage[];
    channels?: LineWorksArchiveChannelSummary[];
    lastReceivedAt?: string | null;
  };
  if (!payload.ok) {
    throw new Error("archive fetch failed");
  }
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    channels: Array.isArray(payload.channels) ? payload.channels : [],
    lastReceivedAt: payload.lastReceivedAt ?? null,
  };
}

export async function openLineWorksAttachment(attachmentId: number): Promise<void> {
  const response = await fetch(`/api/line-works-attachments/${attachmentId}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { ok: boolean; url?: string };
  if (!payload.ok || !payload.url) {
    throw new Error("presigned URL 발급 실패");
  }
  window.open(payload.url, "_blank", "noopener");
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function buildMessageClipboardText(message: LineWorksArchiveMessage): string {
  const lines: string[] = [];
  if (message.text) {
    lines.push(message.text);
  }
  for (const attachment of message.attachments) {
    lines.push(`[첨부] ${attachment.fileName ?? "파일"}`);
  }
  for (const link of message.links) {
    lines.push(link.url);
  }
  return lines.join("\n") || "(내용 없음)";
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
