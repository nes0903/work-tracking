export type LastSeenSource = "notion" | "line-works" | "github";

export type LastSeenMap = Partial<Record<LastSeenSource, string>>;

export async function fetchLastSeenMap(): Promise<LastSeenMap> {
  try {
    const response = await fetch("/api/last-seen", { cache: "no-store" });
    if (!response.ok) return {};
    const payload = (await response.json()) as {
      ok: boolean;
      items?: Record<string, string>;
    };
    return payload.ok && payload.items ? (payload.items as LastSeenMap) : {};
  } catch {
    return {};
  }
}

export async function markLastSeen(source: LastSeenSource): Promise<string | null> {
  try {
    const response = await fetch("/api/last-seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { ok: boolean; at?: string };
    return payload.ok && payload.at ? payload.at : null;
  } catch {
    return null;
  }
}

export function parseTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}
