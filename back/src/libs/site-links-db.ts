import { getDatabase } from "@libs/sqlite-db";

export interface SiteLink {
  id: number;
  label: string;
  url: string;
  category: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface SiteLinkRow {
  id: number;
  label: string;
  url: string;
  category: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const SELECT_COLS = `id, label, url, category, sort_order, created_at, updated_at`;

function hydrate(row: SiteLinkRow): SiteLink {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    category: row.category,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSiteLinks(): SiteLink[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS}
         FROM site_links
         ORDER BY sort_order ASC, id ASC`,
    )
    .all() as unknown as SiteLinkRow[];
  return rows.map(hydrate);
}

export function createSiteLink(input: {
  label: string;
  url: string;
  category?: string | null;
}): SiteLink {
  const db = getDatabase();
  const maxRow = db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS max FROM site_links`)
    .get() as { max: number };
  const nextOrder = Number(maxRow.max) + 1;

  const row = db
    .prepare(
      `INSERT INTO site_links (label, url, category, sort_order)
         VALUES (?, ?, ?, ?)
         RETURNING ${SELECT_COLS}`,
    )
    .get(
      input.label,
      input.url,
      input.category ?? null,
      nextOrder,
    ) as unknown as SiteLinkRow;
  return hydrate(row);
}

export function findSiteLinkByUrl(url: string): SiteLink | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT ${SELECT_COLS}
         FROM site_links
        WHERE url = ?
        ORDER BY id ASC
        LIMIT 1`,
    )
    .get(url) as unknown as SiteLinkRow | undefined;
  return row ? hydrate(row) : null;
}

export interface UpdateSiteLinkInput {
  label?: string;
  url?: string;
  category?: string | null;
  sortOrder?: number;
}

export function updateSiteLink(
  id: number,
  patch: UpdateSiteLinkInput,
): SiteLink | null {
  const db = getDatabase();

  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (patch.label !== undefined) {
    sets.push("label = ?");
    args.push(patch.label);
  }
  if (patch.url !== undefined) {
    sets.push("url = ?");
    args.push(patch.url);
  }
  if (patch.category !== undefined) {
    sets.push("category = ?");
    args.push(patch.category ?? null);
  }
  if (patch.sortOrder !== undefined) {
    sets.push("sort_order = ?");
    args.push(patch.sortOrder);
  }

  if (sets.length === 0) {
    const row = db
      .prepare(
        `SELECT ${SELECT_COLS}
           FROM site_links WHERE id = ?`,
      )
      .get(id) as unknown as SiteLinkRow | undefined;
    return row ? hydrate(row) : null;
  }

  sets.push("updated_at = datetime('now')");

  const row = db
    .prepare(
      `UPDATE site_links SET ${sets.join(", ")} WHERE id = ?
         RETURNING ${SELECT_COLS}`,
    )
    .get(...args, id) as unknown as SiteLinkRow | undefined;
  return row ? hydrate(row) : null;
}

export function deleteSiteLink(id: number): boolean {
  const db = getDatabase();
  const result = db.prepare(`DELETE FROM site_links WHERE id = ?`).run(id);
  return result.changes > 0;
}
