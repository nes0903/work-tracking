import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const NOTION_API_TOKEN = process.env.NOTION_API_TOKEN || "";
const NOTION_WEBHOOK_VERIFICATION_TOKEN = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN || "";
const NOTION_API_VERSION = process.env.NOTION_API_VERSION || "2022-06-28";
const ROOT_PAGE_ID = "26f1bb2bb3098084b279d2cbb304e795";

const DATA_DIR = path.join(__dirname, "data");
const UPDATES_PATH = path.join(DATA_DIR, "notion-updates.json");
const SNAPSHOT_PATH = path.join(DATA_DIR, "notion-snapshot.json");
const WEBHOOK_STATUS_PATH = path.join(DATA_DIR, "notion-webhook-status.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    if (!req.url) {
      sendJson(res, 400, { ok: false, error: "Missing URL" });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        server: "work-tracking",
        notionWebhookConfigured: Boolean(NOTION_WEBHOOK_VERIFICATION_TOKEN),
        notionApiConfigured: Boolean(NOTION_API_TOKEN),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/notion/webhook") {
      await handleNotionWebhook(req, res);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(url.pathname, res, req.method === "HEAD");
      return;
    }

    sendJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    console.error("[server] unhandled error", error);
    sendJson(res, 500, { ok: false, error: "Internal server error" });
  }
}).listen(PORT, HOST, () => {
  console.log(`[work-tracking] http://${HOST}:${PORT}`);
  console.log(`[work-tracking] webhook endpoint: http://${HOST}:${PORT}/api/notion/webhook`);
});

async function handleNotionWebhook(req, res) {
  const rawBody = await readRawBody(req);
  const payload = safeJsonParse(rawBody);

  if (!payload) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
    return;
  }

  if (payload.verification_token) {
    await writeJsonSafe(WEBHOOK_STATUS_PATH, {
      lastVerificationTokenReceivedAt: new Date().toISOString(),
      verificationToken: payload.verification_token,
      note: "Copy this token into your Notion integration verification modal and into NOTION_WEBHOOK_VERIFICATION_TOKEN for signature checks.",
    });
    sendJson(res, 200, { ok: true, receivedVerificationToken: true });
    return;
  }

  if (!NOTION_WEBHOOK_VERIFICATION_TOKEN) {
    sendJson(res, 500, {
      ok: false,
      error: "NOTION_WEBHOOK_VERIFICATION_TOKEN is not configured",
    });
    return;
  }

  if (!verifyNotionSignature(rawBody, req.headers["x-notion-signature"])) {
    sendJson(res, 401, { ok: false, error: "Invalid Notion signature" });
    return;
  }

  if (!payload.type || !payload.entity?.id) {
    sendJson(res, 400, { ok: false, error: "Unexpected Notion event shape" });
    return;
  }

  if (!NOTION_API_TOKEN) {
    sendJson(res, 500, { ok: false, error: "NOTION_API_TOKEN is not configured" });
    return;
  }

  const item = await buildUpdateItem(payload);
  if (!item) {
    sendJson(res, 200, { ok: true, ignored: true, reason: "Out of scope or unsupported event" });
    return;
  }

  await upsertUpdateFeed(item);
  await updateSnapshotFromEvent(item);

  sendJson(res, 200, { ok: true, accepted: true, item });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function verifyNotionSignature(rawBody, headerValue) {
  if (typeof headerValue !== "string" || !headerValue.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", NOTION_WEBHOOK_VERIFICATION_TOKEN).update(rawBody).digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(headerValue);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function buildUpdateItem(event) {
  if (!event.type.startsWith("page.")) {
    return null;
  }

  const page = await notionGet(`/pages/${event.entity.id}`);
  const meta = await resolvePageMetadata(page);
  if (!meta.inScope) {
    return null;
  }

  const eventKind = humanizeEventType(event.type);
  const editor = await resolveEditorName(page.last_edited_by?.id, event.authors);

  return {
    eventId: event.id || cryptoSafeId(event.entity.id, event.timestamp),
    type: event.type,
    title: meta.title || "제목 없음",
    url: page.url || meta.url,
    link: page.url || meta.url,
    editedAt: page.last_edited_time || event.timestamp || null,
    section: meta.section,
    parent: meta.parentTitle,
    editor,
    summary: `${eventKind} 감지`,
  };
}

async function resolvePageMetadata(page) {
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

  const ancestors = [];
  let currentParent = page.parent;
  let immediateParentTitle = null;
  let inScope = false;

  while (currentParent) {
    if (currentParent.type === "page_id") {
      const parentPage = await notionGet(`/pages/${currentParent.page_id}`);
      const parentTitle = extractPageTitle(parentPage);
      if (!immediateParentTitle) immediateParentTitle = parentTitle;
      ancestors.push({ id: compactId(parentPage.id), title: parentTitle });
      if (compactId(parentPage.id) === rootId) {
        inScope = true;
        break;
      }
      currentParent = parentPage.parent;
      continue;
    }

    if (currentParent.type === "database_id") {
      const database = await notionGet(`/databases/${currentParent.database_id}`);
      const databaseTitle = extractRichTitle(database.title);
      if (!immediateParentTitle) immediateParentTitle = databaseTitle;
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

async function resolveEditorName(lastEditedById, authors) {
  const candidateId = lastEditedById || authors?.[0]?.id;
  if (!candidateId) return null;

  try {
    const user = await notionGet(`/users/${candidateId}`);
    return user.name || null;
  } catch {
    return null;
  }
}

async function upsertUpdateFeed(item) {
  const current = await readJsonSafe(UPDATES_PATH, {
    lastSyncedAt: null,
    source: "notion_webhook",
    rootPage: notionPageUrl(ROOT_PAGE_ID),
    items: [],
  });

  const nextItems = [item, ...current.items.filter((entry) => entry.eventId !== item.eventId)].slice(0, 20);

  await writeJsonSafe(UPDATES_PATH, {
    lastSyncedAt: new Date().toISOString(),
    source: "notion_webhook",
    rootPage: notionPageUrl(ROOT_PAGE_ID),
    items: nextItems,
  });
}

async function updateSnapshotFromEvent(item) {
  const current = await readJsonSafe(SNAPSHOT_PATH, {
    lastScannedAt: null,
    rootPage: notionPageUrl(ROOT_PAGE_ID),
    pages: {},
  });

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

  await writeJsonSafe(SNAPSHOT_PATH, current);
}

async function notionGet(endpoint) {
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

  return response.json();
}

function extractPageTitle(page) {
  const properties = page.properties || {};
  for (const value of Object.values(properties)) {
    if (value?.type === "title") {
      return extractRichTitle(value.title);
    }
  }
  return "제목 없음";
}

function extractRichTitle(list) {
  if (!Array.isArray(list)) return "제목 없음";
  return list.map((item) => item?.plain_text || "").join("").trim() || "제목 없음";
}

function humanizeEventType(type) {
  const map = {
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

function notionPageUrl(id) {
  return `https://www.notion.so/${compactId(id)}`;
}

function compactId(id) {
  return String(id || "").replace(/-/g, "");
}

function cryptoSafeId(entityId, timestamp) {
  return createHmac("sha256", "work-tracking").update(`${entityId}:${timestamp}`).digest("hex").slice(0, 16);
}

async function serveStatic(requestPath, res, headOnly) {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const safePath = path.normalize(normalized).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    sendJson(res, 403, { ok: false, error: "Forbidden" });
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    if (!headOnly) res.end(file);
    else res.end();
  } catch {
    sendJson(res, 404, { ok: false, error: "Not found" });
  }
}

async function readJsonSafe(filePath, fallback) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function writeJsonSafe(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}
