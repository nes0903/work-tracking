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
  channelTitle: string | null;
  channelType: string | null;
  userId: string | null;
  userName: string | null;
  contentType: string;
  text: string | null;
  issuedAt: string | null;
  receivedAt: string;
  attachments: LineWorksArchiveAttachment[];
  links: LineWorksArchiveLink[];
}

export interface LineWorksArchiveChannelSummary {
  channelId: string;
  title: string | null;
  channelType: string | null;
  count: number;
}

export interface LineWorksArchivePagination {
  page: number;
  perPage: PerPageOption;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface LineWorksArchive {
  items: LineWorksArchiveMessage[];
  channels: LineWorksArchiveChannelSummary[];
  lastReceivedAt: string | null;
  pagination: LineWorksArchivePagination;
}

export function emptyLineWorksArchive(): LineWorksArchive {
  return {
    items: [],
    channels: [],
    lastReceivedAt: null,
    pagination: {
      page: 1,
      perPage: 50,
      total: 0,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  };
}

export async function fetchLineWorksArchive(
  channelId?: string | null,
  page = 1,
  perPage = 50,
): Promise<LineWorksArchive> {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
  });
  if (channelId) params.set("channelId", channelId);
  const response = await fetch(`/api/line-works-archive?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    ok: boolean;
    items?: LineWorksArchiveMessage[];
    channels?: LineWorksArchiveChannelSummary[];
    lastReceivedAt?: string | null;
    pagination?: LineWorksArchivePagination;
  };
  if (!payload.ok) {
    throw new Error("archive fetch failed");
  }
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    channels: Array.isArray(payload.channels) ? payload.channels : [],
    lastReceivedAt: payload.lastReceivedAt ?? null,
    pagination: normalizeLineWorksPagination(payload.pagination),
  };
}

function normalizeLineWorksPagination(
  value: LineWorksArchivePagination | undefined,
): LineWorksArchivePagination {
  if (!value) return emptyLineWorksArchive().pagination;
  const perPage = [20, 50, 70, 100].includes(value.perPage)
    ? value.perPage
    : 50;
  return {
    page: Math.max(1, Number(value.page) || 1),
    perPage: perPage as PerPageOption,
    total: Math.max(0, Number(value.total) || 0),
    totalPages: Math.max(1, Number(value.totalPages) || 1),
    hasNext: Boolean(value.hasNext),
    hasPrev: Boolean(value.hasPrev),
  };
}

export async function openLineWorksAttachment(
  attachmentId: number,
): Promise<void> {
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
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function buildMessageClipboardText(
  message: LineWorksArchiveMessage,
): string {
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
import type { PerPageOption } from "@/lib/tasks-api";
