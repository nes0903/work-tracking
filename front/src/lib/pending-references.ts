export type PendingReferenceSource =
  | "url"
  | "notion_page"
  | "line_works_message"
  | "line_works_attachment"
  | "site_link"
  | "figma_node";

export interface PendingReference {
  source: PendingReferenceSource;
  externalId: string;
  title: string;
  excerpt?: string | null;
  externalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function pendingKey(ref: {
  source: PendingReferenceSource;
  externalId: string;
}): string {
  return `${ref.source}:${ref.externalId}`;
}

export function isPendingSelected(
  list: PendingReference[],
  ref: { source: PendingReferenceSource; externalId: string },
): boolean {
  const key = pendingKey(ref);
  return list.some((entry) => pendingKey(entry) === key);
}

export function togglePending(
  list: PendingReference[],
  ref: PendingReference,
): PendingReference[] {
  const key = pendingKey(ref);
  const exists = list.some((entry) => pendingKey(entry) === key);
  if (exists) {
    return list.filter((entry) => pendingKey(entry) !== key);
  }
  return [...list, ref];
}

export function removePending(
  list: PendingReference[],
  ref: { source: PendingReferenceSource; externalId: string },
): PendingReference[] {
  const key = pendingKey(ref);
  return list.filter((entry) => pendingKey(entry) !== key);
}

export function sourceIcon(source: PendingReferenceSource): string {
  switch (source) {
    case "url":
      return "🔗";
    case "notion_page":
      return "📄";
    case "line_works_message":
      return "💬";
    case "line_works_attachment":
      return "📎";
    case "site_link":
      return "🔖";
    case "figma_node":
      return "🎨";
    default:
      return "•";
  }
}

export function sourceLabel(source: PendingReferenceSource): string {
  switch (source) {
    case "url":
      return "기타 URL";
    case "notion_page":
      return "Notion";
    case "line_works_message":
      return "Works 메시지";
    case "line_works_attachment":
      return "Works 파일";
    case "site_link":
      return "링크 저장소";
    case "figma_node":
      return "Figma";
    default:
      return source;
  }
}
