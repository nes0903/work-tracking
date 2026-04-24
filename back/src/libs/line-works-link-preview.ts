import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getDatabase } from "@libs/sqlite-db";

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  status: "success" | "failed";
  errorMessage: string | null;
  fetchedAt: string;
}

interface LinkPreviewRow {
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  status: "success" | "failed";
  error_message: string | null;
  fetched_at: string;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3500;
const MAX_HTML_BYTES = 1_000_000;

function hydrate(row: LinkPreviewRow): LinkPreview {
  return {
    url: row.url,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    siteName: row.site_name,
    status: row.status,
    errorMessage: row.error_message,
    fetchedAt: row.fetched_at,
  };
}

function cachedPreview(url: string): LinkPreview | null {
  const row = getDatabase()
    .prepare(
      `SELECT url, title, description, image_url, site_name, status,
              error_message, fetched_at
         FROM line_works_link_previews
        WHERE url = ?`,
    )
    .get(url) as LinkPreviewRow | undefined;
  if (!row) return null;
  const fetchedAt = new Date(row.fetched_at).getTime();
  if (Number.isFinite(fetchedAt) && Date.now() - fetchedAt < CACHE_TTL_MS) {
    return hydrate(row);
  }
  return null;
}

function savePreview(preview: Omit<LinkPreview, "fetchedAt">): LinkPreview {
  const row = getDatabase()
    .prepare(
      `INSERT INTO line_works_link_previews (
         url, title, description, image_url, site_name, status, error_message, fetched_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(url) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         image_url = excluded.image_url,
         site_name = excluded.site_name,
         status = excluded.status,
         error_message = excluded.error_message,
         fetched_at = excluded.fetched_at
       RETURNING url, title, description, image_url, site_name, status,
                 error_message, fetched_at`,
    )
    .get(
      preview.url,
      preview.title,
      preview.description,
      preview.imageUrl,
      preview.siteName,
      preview.status,
      preview.errorMessage,
    ) as unknown as LinkPreviewRow;
  return hydrate(row);
}

export async function getOrFetchLinkPreview(url: string): Promise<LinkPreview> {
  const cached = cachedPreview(url);
  if (cached) return cached;

  try {
    await assertFetchableUrl(url);
    const preview = await fetchPreview(url);
    return savePreview({ ...preview, status: "success", errorMessage: null });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "preview fetch failed";
    return savePreview({
      url,
      title: null,
      description: null,
      imageUrl: null,
      siteName: null,
      status: "failed",
      errorMessage: message,
    });
  }
}

async function assertFetchableUrl(value: string): Promise<void> {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("unsupported protocol");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new Error("local host is blocked");
  }

  const directIpVersion = isIP(hostname);
  if (directIpVersion && isBlockedIp(hostname)) {
    throw new Error("private IP is blocked");
  }

  if (!directIpVersion) {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.some((entry) => isBlockedIp(entry.address))) {
      throw new Error("private network target is blocked");
    }
  }
}

function isBlockedIp(ip: string): boolean {
  if (ip === "::1") return true;
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) {
    return true;
  }
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

async function fetchPreview(url: string): Promise<{
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WorkTrackingLinkPreview/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error("not html");
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_HTML_BYTES) {
    throw new Error("html too large");
  }

  const html = (await response.text()).slice(0, MAX_HTML_BYTES);
  const baseUrl = response.url || url;
  return {
    url,
    title:
      metaContent(html, "property", "og:title") ??
      metaContent(html, "name", "twitter:title") ??
      titleTag(html),
    description:
      metaContent(html, "property", "og:description") ??
      metaContent(html, "name", "description") ??
      metaContent(html, "name", "twitter:description"),
    imageUrl: absoluteUrl(
      metaContent(html, "property", "og:image") ??
        metaContent(html, "name", "twitter:image"),
      baseUrl,
    ),
    siteName:
      metaContent(html, "property", "og:site_name") ?? hostnameLabel(baseUrl),
  };
}

function metaContent(
  html: string,
  attrName: "property" | "name",
  attrValue: string,
): string | null {
  const tagPattern = /<meta\s+[^>]*>/gi;
  const tags = html.match(tagPattern) ?? [];
  for (const tag of tags) {
    const attr = readHtmlAttr(tag, attrName);
    if (attr?.toLowerCase() !== attrValue.toLowerCase()) continue;
    return cleanText(readHtmlAttr(tag, "content"));
  }
  return null;
}

function readHtmlAttr(tag: string, name: string): string | null {
  const pattern = new RegExp(`${name}\\s*=\\s*(['"])(.*?)\\1`, "i");
  const match = tag.match(pattern);
  return match?.[2] ? decodeEntities(match[2]) : null;
}

function titleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(match?.[1] ? decodeEntities(match[1]) : null);
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function absoluteUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function hostnameLabel(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
