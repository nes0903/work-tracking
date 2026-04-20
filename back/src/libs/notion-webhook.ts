import { createHmac, timingSafeEqual } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getNotionFeedFromStore,
  setNotionFeedInStore,
} from "@libs/dashboard-db";
import { emptyNotionFeed } from "@libs/work-tracking";
import { getDatabase } from "@libs/sqlite-db";
import { emitFeedUpdate } from "@libs/feed-events";

const NOTION_WEBHOOK_VERIFICATION_TOKEN =
  process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN || "";
const NOTION_API_TOKEN = process.env.NOTION_API_TOKEN || "";
const NOTION_API_VERSION = process.env.NOTION_API_VERSION || "2022-06-28";

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const WEBHOOK_STATUS_PATH = path.join(DATA_DIR, "notion-webhook-status.json");

const MAX_FEED_ITEMS = 20;

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
  type?: "page_id" | "database_id" | "workspace" | "block_id";
  page_id?: string;
  database_id?: string;
  block_id?: string;
  workspace?: boolean;
}

interface NotionUserRef {
  id?: string;
  object?: string;
}

interface NotionPageResponse {
  id?: string;
  url?: string;
  parent?: NotionParent;
  last_edited_by?: NotionUserRef;
  last_edited_time?: string;
  properties?: Record<string, NotionPropertyValue>;
}

interface NotionDatabaseResponse {
  id?: string;
  url?: string;
  parent?: NotionParent;
  title?: NotionRichText[];
}

interface NotionUserResponse {
  id?: string;
  name?: string;
  type?: string;
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

  if (!payload.type.startsWith("page.")) {
    return {
      status: 200,
      body: { ok: true, ignored: true, reason: "Non-page event" },
    };
  }

  const item = await buildUpdateItem(payload);
  upsertUpdateFeed(item);

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
): Promise<UpdateFeedItem> {
  const entityId = event.entity?.id ?? "";
  const eventKind = humanizeEventType(event.type ?? "");

  const page = await fetchPageSafely(entityId);
  const title = page ? extractPageTitle(page) : "";
  const url = page?.url || notionPageUrl(entityId);

  const breadcrumb = page ? await buildBreadcrumb(page.parent) : [];
  const section = breadcrumb[0] ?? "";
  const parent = breadcrumb.length > 1 ? breadcrumb.slice(1).join(" / ") : null;

  const editorId = page?.last_edited_by?.id;
  const editor = editorId ? await fetchUserName(editorId) : null;

  return {
    eventId: event.id || cryptoSafeId(entityId, event.timestamp),
    type: event.type ?? "",
    title: title || eventKind,
    url,
    link: url,
    editedAt: event.timestamp ?? null,
    section,
    parent,
    editor,
    summary: `${eventKind} 감지`,
  };
}

const MAX_BREADCRUMB_DEPTH = 6;

async function buildBreadcrumb(start: NotionParent | undefined): Promise<string[]> {
  const segments: string[] = [];
  const seen = new Set<string>();
  let cursor = start;

  for (let step = 0; step < MAX_BREADCRUMB_DEPTH; step += 1) {
    if (!cursor || !cursor.type) {
      break;
    }

    if (cursor.type === "workspace") {
      break;
    }

    if (cursor.type === "page_id" && cursor.page_id) {
      if (seen.has(cursor.page_id)) {
        break;
      }
      seen.add(cursor.page_id);
      const parentPage = await fetchPageSafely(cursor.page_id);
      if (!parentPage) {
        break;
      }
      const title = extractPageTitle(parentPage);
      if (title) {
        segments.unshift(title);
      }
      cursor = parentPage.parent;
      continue;
    }

    if (cursor.type === "database_id" && cursor.database_id) {
      if (seen.has(cursor.database_id)) {
        break;
      }
      seen.add(cursor.database_id);
      const database = await fetchDatabaseSafely(cursor.database_id);
      if (!database) {
        break;
      }
      const title = extractRichTitle(database.title);
      if (title) {
        segments.unshift(title);
      }
      cursor = database.parent;
      continue;
    }

    break;
  }

  return segments;
}

async function fetchDatabaseSafely(id: string) {
  if (!id || !NOTION_API_TOKEN) {
    return null;
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${id}`, {
      headers: {
        Authorization: `Bearer ${NOTION_API_TOKEN}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as NotionDatabaseResponse;
  } catch {
    return null;
  }
}

async function fetchUserName(id: string): Promise<string | null> {
  if (!id || !NOTION_API_TOKEN) {
    return null;
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/users/${id}`, {
      headers: {
        Authorization: `Bearer ${NOTION_API_TOKEN}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const user = (await response.json()) as NotionUserResponse;
    return user.name?.trim() || null;
  } catch {
    return null;
  }
}

async function fetchPageSafely(entityId: string) {
  if (!entityId || !NOTION_API_TOKEN) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.notion.com/v1/pages/${entityId}`,
      {
        headers: {
          Authorization: `Bearer ${NOTION_API_TOKEN}`,
          "Notion-Version": NOTION_API_VERSION,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as NotionPageResponse;
  } catch {
    return null;
  }
}

function extractPageTitle(page: NotionPageResponse) {
  const properties = page.properties || {};
  for (const value of Object.values(properties)) {
    if (value?.type === "title") {
      return extractRichTitle(value.title);
    }
  }
  return "";
}

function extractRichTitle(list?: NotionRichText[]) {
  if (!Array.isArray(list)) {
    return "";
  }
  return list
    .map((item) => item?.plain_text || "")
    .join("")
    .trim();
}

function upsertUpdateFeed(item: UpdateFeedItem) {
  const current = getNotionFeedFromStore() ?? emptyNotionFeed();
  const db = getDatabase();

  const nextItems = [
    item,
    ...current.items.filter((entry) => entry.eventId !== item.eventId),
  ].slice(0, MAX_FEED_ITEMS);

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

  emitFeedUpdate("notion");
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
  return map[type] || type || "Notion 페이지 업데이트";
}

function notionPageUrl(id: string) {
  return `https://www.notion.so/${compactId(id)}`;
}

function compactId(id: string) {
  return String(id || "").replace(/-/g, "");
}

function cryptoSafeId(entityId: string, timestamp?: string) {
  return createHmac("sha256", "work-tracking")
    .update(`${entityId}:${timestamp ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

async function writeJsonSafe(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
