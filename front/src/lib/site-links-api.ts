export interface SiteLink {
  id: number;
  label: string;
  url: string;
  category: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type SiteLinkCategory = string;

export async function fetchSiteLinks(): Promise<SiteLink[]> {
  try {
    const response = await fetch("/api/site-links", { cache: "no-store" });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      ok: boolean;
      items?: SiteLink[];
    };
    return payload.ok ? (payload.items ?? []) : [];
  } catch {
    return [];
  }
}

export async function fetchSiteLinkCategories(): Promise<string[]> {
  try {
    const response = await fetch("/api/site-links/categories", {
      cache: "no-store",
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      ok: boolean;
      items?: string[];
    };
    return payload.ok ? (payload.items ?? []) : [];
  } catch {
    return [];
  }
}

export async function createSiteLinkCategory(name: string): Promise<string[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];
  try {
    const response = await fetch("/api/site-links/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      ok: boolean;
      items?: string[];
    };
    return payload.ok ? (payload.items ?? []) : [];
  } catch {
    return [];
  }
}

export async function renameSiteLinkCategory(
  oldName: string,
  newName: string,
): Promise<string[]> {
  const next = newName.trim();
  if (!oldName.trim() || !next) return [];
  try {
    const response = await fetch(
      `/api/site-links/categories/${encodeURIComponent(oldName)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      },
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      ok: boolean;
      items?: string[];
    };
    return payload.ok ? (payload.items ?? []) : [];
  } catch {
    return [];
  }
}

export async function createSiteLink(input: {
  label: string;
  url: string;
  category?: string | null;
}): Promise<SiteLink | null> {
  try {
    const response = await fetch("/api/site-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      ok: boolean;
      item?: SiteLink;
    };
    return payload.ok && payload.item ? payload.item : null;
  } catch {
    return null;
  }
}

export async function updateSiteLink(
  id: number,
  patch: {
    label?: string;
    url?: string;
    category?: string | null;
    sortOrder?: number;
  },
): Promise<SiteLink | null> {
  try {
    const response = await fetch(`/api/site-links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      ok: boolean;
      item?: SiteLink;
    };
    return payload.ok && payload.item ? payload.item : null;
  } catch {
    return null;
  }
}

export async function deleteSiteLink(id: number): Promise<boolean> {
  try {
    const response = await fetch(`/api/site-links/${id}`, { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}
