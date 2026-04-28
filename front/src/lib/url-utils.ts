const ABSOLUTE_HTTP_URL_REGEX = /^https?:\/\//i;
const SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:/i;
const LINK_CANDIDATE_REGEX =
  /https?:\/\/[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{2,5})?(?:\/[^\s<>"']*)?/gi;
const TRAILING_URL_PUNCTUATION = /[),.;!?'"]+$/g;
const URL_PARSE_BASE = "https://work-tracking.local";

export interface TextLinkMatch {
  value: string;
  href: string;
  start: number;
  end: number;
}

export function toExternalHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (SCHEME_REGEX.test(trimmed) || trimmed.startsWith("//")) {
    return trimmed;
  }
  return `//${trimmed}`;
}

export function safeHostname(value: string): string | null {
  const href = toExternalHref(value);
  if (!href) return null;
  try {
    return new URL(href, URL_PARSE_BASE).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function findLinksInText(text: string): TextLinkMatch[] {
  const matches: TextLinkMatch[] = [];
  for (const match of text.matchAll(LINK_CANDIDATE_REGEX)) {
    const rawValue = match[0];
    const start = match.index ?? 0;
    if (!ABSOLUTE_HTTP_URL_REGEX.test(rawValue)) {
      const previous = start > 0 ? text[start - 1] : "";
      if (/[\w@/.-]/.test(previous)) continue;
    }

    const value = rawValue.replace(TRAILING_URL_PUNCTUATION, "");
    if (!value) continue;
    matches.push({
      value,
      href: toExternalHref(value),
      start,
      end: start + value.length,
    });
  }
  return matches;
}

export function isSingleLinkText(text: string): TextLinkMatch | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const matches = findLinksInText(trimmed);
  if (matches.length !== 1) return null;
  const [match] = matches;
  return match.start === 0 && match.end === trimmed.length ? match : null;
}
