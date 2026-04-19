export interface FigmaUrlParts {
  fileKey: string;
  nodeId: string | null;
  urlType: "file" | "design";
}

/**
 * Figma URL 파싱.
 * 지원 형식:
 *   https://www.figma.com/file/<fileKey>/<slug>?node-id=<nodeId>
 *   https://www.figma.com/design/<fileKey>/<slug>?node-id=<nodeId>
 *   (www 없는 경우도 허용)
 */
export function parseFigmaUrl(raw: string): FigmaUrlParts | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(
    /^https?:\/\/(?:www\.)?figma\.com\/(file|design)\/([a-zA-Z0-9]+)\//,
  );
  if (!match) return null;

  const urlType = match[1] as "file" | "design";
  const fileKey = match[2];

  const nodeMatch = trimmed.match(/[?&]node-id=([^&]+)/);
  const nodeIdRaw = nodeMatch ? nodeMatch[1] : null;
  const nodeId = nodeIdRaw
    ? decodeURIComponent(nodeIdRaw).replace("-", ":") // figma sometimes uses "1-234" instead of "1:234"
    : null;

  return { fileKey, nodeId, urlType };
}

export function isFigmaUrl(raw: string): boolean {
  return parseFigmaUrl(raw) !== null;
}
