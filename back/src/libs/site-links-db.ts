import { getDatabase } from "./postgres-db";

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
    id: Number(row.id),
    label: row.label,
    url: row.url,
    category: row.category,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSiteLinks(): Promise<SiteLink[]> {
  const db = getDatabase();
  const rows = await db
    .prepare(
      `SELECT ${SELECT_COLS}
         FROM site_links
         ORDER BY sort_order ASC, id ASC`,
    )
    .all();
  return rows.map(hydrate);
}

export async function listSiteLinkCategories(): Promise<string[]> {
  const db = getDatabase();
  const rows = await db
    .prepare(
      `SELECT name
         FROM site_link_categories
        ORDER BY sort_order ASC, name ASC`,
    )
    .all();
  return rows.map((row) => row.name);
}

export async function createSiteLinkCategory(name: string): Promise<string[]> {
  const trimmed = name.trim();
  if (!trimmed) return listSiteLinkCategories();
  const db = getDatabase();
  const maxRow = await db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS max FROM site_link_categories`,
    )
    .get();
  await db
    .prepare(
      `INSERT INTO site_link_categories (name, sort_order)
     VALUES (?, ?)
     ON CONFLICT (name) DO NOTHING`,
    )
    .run(trimmed, Number(maxRow?.max ?? -1) + 1);
  return listSiteLinkCategories();
}

export async function renameSiteLinkCategory(
  oldName: string,
  newName: string,
): Promise<string[]> {
  const oldTrimmed = oldName.trim();
  const newTrimmed = newName.trim();
  if (!oldTrimmed || !newTrimmed || oldTrimmed === newTrimmed) {
    return listSiteLinkCategories();
  }

  const db = getDatabase();
  await db.transaction(async (transaction) => {
    const existing = await transaction
      .prepare(`SELECT sort_order FROM site_link_categories WHERE name = ?`)
      .get(oldTrimmed);
    const sortOrder = existing?.sort_order ?? 0;
    await transaction
      .prepare(
        `INSERT INTO site_link_categories (name, sort_order)
       VALUES (?, ?)
       ON CONFLICT (name) DO NOTHING`,
      )
      .run(newTrimmed, sortOrder);
    await transaction
      .prepare(`UPDATE site_links SET category = ? WHERE category = ?`)
      .run(newTrimmed, oldTrimmed);
    await transaction
      .prepare(
        `DELETE FROM site_link_categories
        WHERE name = ?
          AND NOT EXISTS (
            SELECT 1 FROM site_links WHERE category = site_link_categories.name
          )`,
      )
      .run(oldTrimmed);
  });

  return listSiteLinkCategories();
}

export async function createSiteLink(input: {
  label: string;
  url: string;
  category?: string | null;
}): Promise<SiteLink> {
  const db = getDatabase();
  const category = input.category?.trim() || null;
  if (category) {
    await createSiteLinkCategory(category);
  }
  const maxRow = (await db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS max FROM site_links`)
    .get()) as { max: number | string };
  const nextOrder = Number(maxRow.max) + 1;

  const row = (await db
    .prepare(
      `INSERT INTO site_links (label, url, category, sort_order)
         VALUES (?, ?, ?, ?)
         RETURNING ${SELECT_COLS}`,
    )
    .get(input.label, input.url, category, nextOrder)) as SiteLinkRow;
  return hydrate(row);
}

export async function findSiteLinkByUrl(url: string): Promise<SiteLink | null> {
  const db = getDatabase();
  const row = await db
    .prepare(
      `SELECT ${SELECT_COLS}
         FROM site_links
        WHERE url = ?
        ORDER BY id ASC
        LIMIT 1`,
    )
    .get(url);
  return row ? hydrate(row) : null;
}

export interface UpdateSiteLinkInput {
  label?: string;
  url?: string;
  category?: string | null;
  sortOrder?: number;
}

export async function updateSiteLink(
  id: number,
  patch: UpdateSiteLinkInput,
): Promise<SiteLink | null> {
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
    const category = patch.category?.trim() || null;
    if (category) {
      await createSiteLinkCategory(category);
    }
    args.push(category);
  }
  if (patch.sortOrder !== undefined) {
    sets.push("sort_order = ?");
    args.push(patch.sortOrder);
  }

  if (sets.length === 0) {
    const row = await db
      .prepare(
        `SELECT ${SELECT_COLS}
           FROM site_links WHERE id = ?`,
      )
      .get(id);
    return row ? hydrate(row) : null;
  }

  sets.push("updated_at = datetime('now')");

  const row = await db
    .prepare(
      `UPDATE site_links SET ${sets.join(", ")} WHERE id = ?
         RETURNING ${SELECT_COLS}`,
    )
    .get(...args, id);
  return row ? hydrate(row) : null;
}

export interface ReorderSiteLinkInput {
  id: number;
  category: string | null;
  sortOrder: number;
}

export async function reorderSiteLinks(
  items: ReorderSiteLinkInput[],
): Promise<SiteLink[]> {
  const db = getDatabase();
  const cleaned = items
    .filter((item) => Number.isInteger(item.id) && item.id > 0)
    .map((item, index) => ({
      id: item.id,
      category: item.category?.trim() || null,
      sortOrder: Number.isFinite(item.sortOrder)
        ? Math.floor(item.sortOrder)
        : index,
    }));

  if (cleaned.length === 0) return listSiteLinks();

  await db.transaction(async (transaction) => {
    const update = transaction.prepare(
      `UPDATE site_links
          SET category = ?, sort_order = ?, updated_at = datetime('now')
        WHERE id = ?`,
    );
    for (const item of cleaned) {
      if (item.category) {
        await transaction
          .prepare(
            `INSERT INTO site_link_categories (name, sort_order)
           VALUES (?, ?)
           ON CONFLICT (name) DO NOTHING`,
          )
          .run(item.category, item.sortOrder);
      }
      await update.run(item.category, item.sortOrder, item.id);
    }
  });

  return listSiteLinks();
}

export async function deleteSiteLink(id: number): Promise<boolean> {
  const db = getDatabase();
  const result = await db
    .prepare(`DELETE FROM site_links WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}
