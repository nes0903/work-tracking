import { createHmac, timingSafeEqual } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getNotionFeedFromStore,
  setNotionFeedInStore,
} from "@libs/dashboard-db";
import { getNotionSnapshot, setNotionSnapshot } from "@libs/feed-store";
import { emptyNotionFeed } from "@libs/work-tracking";
import { getDatabase } from "@libs/sqlite-db";

const NOTION_API_TOKEN = process.env.NOTION_API_TOKEN || "";
const NOTION_WEBHOOK_VERIFICATION_TOKEN =
  process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN || "";
const NOTION_API_VERSION = process.env.NOTION_API_VERSION || "2022-06-28";
const ROOT_PAGE_ID = "26f1bb2bb3098084b279d2cbb304e795";

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const WEBHOOK_STATUS_PATH = path.join(DATA_DIR, "notion-webhook-status.json");

interface NotionWebhookEvent {
  id?: string;
  type?: string;
  timestamp?: string;
  verification_token?: string;
  entity?: {
    id?: string;
  };
  authors?: Array<{
    id?: string;
  }>;
}

interface NotionRichText {
  plain_text?: string;
}

interface NotionPropertyValue {
  type?: string;
  title?: NotionRichText[];
}

interface NotionParent {
  type?: string;
  page_id?: string;
  database_id?: string;
}

interface NotionPageResponse {
  id?: string;
  url?: string;
  parent?: NotionParent;
  title?: NotionRichText[];
  last_edited_time?: string;
  last_edited_by?: {
    id?: string;
  };
  properties?: Record<string, NotionPropertyValue>;
}

interface NotionUserResponse {
  name?: string;
}

interface UpdateFeedItem {
  eventId: string;
  type: string;
  title: string;
  url: string;
  link: string;
  editedAt: string | null;
  section: string;
  parent: string | null;
  editor: string | null;
  summary: string;
}

export interface NotionWebhookResult {
  status: number;
  body: {
    ok: boolean;
    error?: string;
    receivedVerificationToken?: boolean;
    accepted?: boolean;
    ignored?: boolean;
    reason?: string;
    item?: UpdateFeedItem;
  };
}

interface SnapshotPage {
  title: string;
  url: string;
  parent: string | null;
  section: string;
  contentHash: string | null;
  fetchedAt: string | null;
  lastEventType: string;
}

interface NotionSnapshotFile {
  lastScannedAt: string | null;
  rootPage: string;
  pages: Record<string, SnapshotPage>;
}

export async function handleNotionWebhook(
  rawBody: string,
  signature: string | null,
): Promise<NotionWebhookResult> {
  const payload = safeJsonParse(rawBody) as NotionWebhookEvent | null;

  if (!payload) {
    return {
      status: 400,
      body: { ok: false, error: "Invalid JSON body" },
    };
  }

  if (payload.verification_token) {
    await writeJsonSafe(WEBHOOK_STATUS_PATH, {
      lastVerificationTokenReceivedAt: new Date().toISOString(),
      verificationToken: payload.verification_token,
      note: "Copy this token into your Notion integration verification modal and into NOTION_WEBHOOK_VERIFICATION_TOKEN for signature checks.",
    });

    return {
      status: 200,
      body: { ok: true, receivedVerificationToken: true },
    };
  }

  if (!NOTION_WEBHOOK_VERIFICATION_TOKEN) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "NOTION_WEBHOOK_VERIFICATION_TOKEN is not configured",
      },
    };
  }

  if (!verifyNotionSignature(rawBody, signature)) {
    return {
      status: 401,
      body: { ok: false, error: "Invalid Notion signature" },
    };
  }

  if (!payload.type || !payload.entity?.id) {
    return {
      status: 400,
      body: { ok: false, error: "Unexpected Notion event shape" },
    };
  }

  if (!NOTION_API_TOKEN) {
    return {
      status: 500,
      body: { ok: false, error: "NOTION_API_TOKEN is not configured" },
    };
  }

  const item = await buildUpdateItem(payload);
  if (!item) {
    return {
      status: 200,
      body: {
        ok: true,
        ignored: true,
        reason: "Out of scope or unsupported event",
      },
    };
  }

  await upsertUpdateFeed(item);
  await updateSnapshotFromEvent(item);

  return {
    status: 200,
    body: { ok: true, accepted: true, item },
  };
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function verifyNotionSignature(rawBody: string, headerValue: string | null) {
  if (typeof headerValue !== "string" || !headerValue.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", NOTION_WEBHOOK_VERIFICATION_TOKEN).update(rawBody).digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(headerValue);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

async function buildUpdateItem(
  event: NotionWebhookEvent,
): Promise<UpdateFeedItem | null> {
  if (!event.type?.startsWith("page.")) {
    return null;
  }

  const page = await notionGet<NotionPageResponse>(
    `/pages/${event.entity?.id}`,
  );
  const meta = await resolvePageMetadata(page);
  if (!meta.inScope) {
    return null;
  }

  const eventKind = humanizeEventType(event.type);
  const editor = await resolveEditorName(
    page.last_edited_by?.id,
    event.authors,
  );
  const resolvedUrl =
    page.url || meta.url || notionPageUrl(event.entity?.id || ROOT_PAGE_ID);

  return {
    eventId: event.id || cryptoSafeId(event.entity?.id, event.timestamp),
    type: event.type,
    title: meta.title || "제목 없음",
    url: resolvedUrl,
    link: resolvedUrl,
    editedAt: page.last_edited_time || event.timestamp || null,
    section: meta.section || "플랫폼 본부",
    parent: meta.parentTitle ?? null,
    editor,
    summary: `${eventKind} 감지`,
  };
}

async function resolvePageMetadata(page: NotionPageResponse) {
  const pageId = compactId(page.id);
  const rootId = compactId(ROOT_PAGE_ID);
  const title = extractPageTitle(page);
  const url = page.url || notionPageUrl(page.id);

  if (pageId === rootId) {
    return {
      inScope: true,
      title,
      url,
      section: title || "플랫폼 본부",
      parentTitle: null,
    };
  }

  const ancestors: Array<{ id: string; title: string }> = [];
  let currentParent = page.parent;
  let immediateParentTitle: string | null = null;
  let inScope = false;

  while (currentParent) {
    if (currentParent.type === "page_id") {
      const parentPage = await notionGet<NotionPageResponse>(
        `/pages/${currentParent.page_id}`,
      );
      const parentTitle = extractPageTitle(parentPage);
      if (!immediateParentTitle) {
        immediateParentTitle = parentTitle;
      }
      ancestors.push({ id: compactId(parentPage.id), title: parentTitle });
      if (compactId(parentPage.id) === rootId) {
        inScope = true;
        break;
      }
      currentParent = parentPage.parent;
      continue;
    }

    if (currentParent.type === "database_id") {
      const database = await notionGet<NotionPageResponse>(
        `/databases/${currentParent.database_id}`,
      );
      const databaseTitle = extractRichTitle(database.title);
      if (!immediateParentTitle) {
        immediateParentTitle = databaseTitle;
      }
      ancestors.push({ id: compactId(database.id), title: databaseTitle });
      currentParent = database.parent;
      continue;
    }

    if (currentParent.type === "workspace") {
      break;
    }

    break;
  }

  if (!inScope) {
    return { inScope: false };
  }

  const ancestorBelowRoot = ancestors.find((node) => node.id !== rootId);
  const section = ancestorBelowRoot?.title || title || "플랫폼 본부";

  return {
    inScope: true,
    title,
    url,
    section,
    parentTitle: immediateParentTitle || "플랫폼 본부",
  };
}

async function resolveEditorName(
  lastEditedById?: string,
  authors?: NotionWebhookEvent["authors"],
) {
  const candidateId = lastEditedById || authors?.[0]?.id;
  if (!candidateId) {
    return null;
  }

  try {
    const user = await notionGet<NotionUserResponse>(`/users/${candidateId}`);
    return user.name || null;
  } catch {
    return null;
  }
}

async function upsertUpdateFeed(item: UpdateFeedItem) {
  const current = getNotionFeedFromStore() ?? emptyNotionFeed();
  const db = getDatabase();

  const nextItems = [
    item,
    ...current.items.filter((entry) => entry.eventId !== item.eventId),
  ].slice(0, 20);

  setNotionFeedInStore({
    lastSyncedAt: new Date().toISOString(),
    items: nextItems,
  });

  db.prepare(
    `
      INSERT INTO notion_update_events (
        event_id, event_type, page_url, page_link, title, edited_at,
        section_title, parent_title, editor_name, summary, processed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(event_id) DO UPDATE SET
        event_type = excluded.event_type,
        page_url = excluded.page_url,
        page_link = excluded.page_link,
        title = excluded.title,
        edited_at = excluded.edited_at,
        section_title = excluded.section_title,
        parent_title = excluded.parent_title,
        editor_name = excluded.editor_name,
        summary = excluded.summary,
        processed_at = excluded.processed_at
    `,
  ).run(
    item.eventId,
    item.type,
    item.url,
    item.link,
    item.title,
    item.editedAt,
    item.section,
    item.parent,
    item.editor,
    item.summary,
  );
}

async function updateSnapshotFromEvent(item: UpdateFeedItem) {
  const current = getNotionSnapshot<NotionSnapshotFile>() ?? {
    lastScannedAt: null,
    rootPage: notionPageUrl(ROOT_PAGE_ID),
    pages: {},
  };
  const db = getDatabase();

  current.lastScannedAt = new Date().toISOString();
  current.pages[item.url] = {
    title: item.title,
    url: item.url,
    parent: item.parent,
    section: item.section,
    contentHash: current.pages[item.url]?.contentHash || null,
    fetchedAt: item.editedAt,
    lastEventType: item.type,
  };

  setNotionSnapshot(current);

  db.prepare(
    `
      INSERT INTO notion_pages_snapshot (
        page_url, title, parent_title, section_title, content_hash,
        fetched_at, last_scanned_at, last_event_type, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
      ON CONFLICT(page_url) DO UPDATE SET
        title = excluded.title,
        parent_title = excluded.parent_title,
        section_title = excluded.section_title,
        content_hash = excluded.content_hash,
        fetched_at = excluded.fetched_at,
        last_scanned_at = excluded.last_scanned_at,
        last_event_type = excluded.last_event_type,
        updated_at = excluded.updated_at
    `,
  ).run(
    item.url,
    item.title,
    item.parent,
    item.section,
    current.pages[item.url]?.contentHash || null,
    item.editedAt,
    item.type,
  );
}

async function notionGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    headers: {
      Authorization: `Bearer ${NOTION_API_TOKEN}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Notion API ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

function extractPageTitle(page: NotionPageResponse) {
  const properties = page.properties || {};
  for (const value of Object.values(properties)) {
    if (value?.type === "title") {
      return extractRichTitle(value.title);
    }
  }
  return "제목 없음";
}

function extractRichTitle(list?: NotionRichText[]) {
  if (!Array.isArray(list)) {
    return "제목 없음";
  }
  return (
    list
      .map((item) => item?.plain_text || "")
      .join("")
      .trim() || "제목 없음"
  );
}

function humanizeEventType(type: string) {
  const map: Record<string, string> = {
    "page.created": "새 페이지 생성",
    "page.content_updated": "페이지 내용 변경",
    "page.properties_updated": "페이지 속성 변경",
    "page.moved": "페이지 이동",
    "page.deleted": "페이지 삭제",
    "page.undeleted": "페이지 복구",
    "page.locked": "페이지 잠금 상태 변경",
  };
  return map[type] || type;
}

function notionPageUrl(id: string | undefined) {
  return `https://www.notion.so/${compactId(id)}`;
}

function compactId(id: string | undefined) {
  return String(id || "").replace(/-/g, "");
}

function cryptoSafeId(entityId?: string, timestamp?: string) {
  return createHmac("sha256", "work-tracking")
    .update(`${entityId}:${timestamp}`)
    .digest("hex")
    .slice(0, 16);
}

async function writeJsonSafe(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
