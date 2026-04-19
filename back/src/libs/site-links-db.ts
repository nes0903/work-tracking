import { getDatabase } from "@libs/sqlite-db";

export interface SiteLink {
  id: number;
  label: string;
  url: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface SiteLinkRow {
  id: number;
  label: string;
  url: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function hydrate(row: SiteLinkRow): SiteLink {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSiteLinks(): SiteLink[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, label, url, sort_order, created_at, updated_at
         FROM site_links
         ORDER BY sort_order ASC, id ASC`,
    )
    .all() as unknown as SiteLinkRow[];
  return rows.map(hydrate);
}

export function createSiteLink(input: { label: string; url: string }): SiteLink {
  const db = getDatabase();
  const maxRow = db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS max FROM site_links`)
    .get() as { max: number };
  const nextOrder = Number(maxRow.max) + 1;

  const row = db
    .prepare(
      `INSERT INTO site_links (label, url, sort_order)
         VALUES (?, ?, ?)
         RETURNING id, label, url, sort_order, created_at, updated_at`,
    )
    .get(input.label, input.url, nextOrder) as unknown as SiteLinkRow;
  return hydrate(row);
}

export interface UpdateSiteLinkInput {
  label?: string;
  url?: string;
  sortOrder?: number;
}

export function updateSiteLink(
  id: number,
  patch: UpdateSiteLinkInput,
): SiteLink | null {
  const db = getDatabase();

  const sets: string[] = [];
  const args: (string | number)[] = [];

  if (patch.label !== undefined) {
    sets.push("label = ?");
    args.push(patch.label);
  }
  if (patch.url !== undefined) {
    sets.push("url = ?");
    args.push(patch.url);
  }
  if (patch.sortOrder !== undefined) {
    sets.push("sort_order = ?");
    args.push(patch.sortOrder);
  }

  if (sets.length === 0) {
    const row = db
      .prepare(
        `SELECT id, label, url, sort_order, created_at, updated_at
           FROM site_links WHERE id = ?`,
      )
      .get(id) as unknown as SiteLinkRow | undefined;
    return row ? hydrate(row) : null;
  }

  sets.push("updated_at = datetime('now')");

  const row = db
    .prepare(
      `UPDATE site_links SET ${sets.join(", ")} WHERE id = ?
         RETURNING id, label, url, sort_order, created_at, updated_at`,
    )
    .get(...args, id) as unknown as SiteLinkRow | undefined;
  return row ? hydrate(row) : null;
}

export function deleteSiteLink(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare(`DELETE FROM site_links WHERE id = ?`).run(id);
  return result.changes > 0;
}
