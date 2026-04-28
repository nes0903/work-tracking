import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const TOKEN_URL = "https://auth.worksmobile.com/oauth2/v2.0/token";
const ATTACHMENT_URL = (botId: string, fileId: string) =>
  `https://www.worksapis.com/v1.0/bots/${encodeURIComponent(botId)}/attachments/${encodeURIComponent(fileId)}`;
const CHANNEL_INFO_URL = (botId: string, channelId: string) =>
  `https://www.worksapis.com/v1.0/bots/${encodeURIComponent(botId)}/channels/${encodeURIComponent(channelId)}`;
const USER_INFO_URL = (userId: string) =>
  `https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}`;

const ACCESS_TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000;

export interface BotConfig {
  botId: string;
  botSecret: string;
  clientId: string;
  clientSecret: string;
  serviceAccount: string;
  privateKeyPem: string;
  targetChannelIds: string[];
  allowAllChannels: boolean;
}

export function loadBotConfig(): BotConfig | null {
  const botId = process.env.LINE_WORKS_BOT_ID;
  const botSecret = process.env.LINE_WORKS_BOT_SECRET;
  const clientId = process.env.LINE_WORKS_CLIENT_ID;
  const clientSecret = process.env.LINE_WORKS_CLIENT_SECRET;
  const serviceAccount = process.env.LINE_WORKS_SERVICE_ACCOUNT;
  const privateKeyPath = process.env.LINE_WORKS_PRIVATE_KEY_PATH;

  if (!botId || !botSecret || !clientId || !clientSecret || !serviceAccount || !privateKeyPath) {
    return null;
  }

  let privateKeyPem: string;
  try {
    privateKeyPem = readFileSync(privateKeyPath, "utf8");
  } catch (err) {
    console.error("[line-works-bot] failed to read private key", err);
    return null;
  }

  const rawTargets = (process.env.LINE_WORKS_TARGET_CHANNEL_IDS ?? "").trim();
  const targetChannelIds = rawTargets
    ? rawTargets.split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];
  const allowAllChannels = rawTargets === "*";

  return {
    botId,
    botSecret,
    clientId,
    clientSecret,
    serviceAccount,
    privateKeyPem,
    targetChannelIds,
    allowAllChannels,
  };
}

export function isChannelAllowed(config: BotConfig, channelId: string | undefined): boolean {
  if (!channelId) {
    return false;
  }
  if (config.allowAllChannels) {
    return true;
  }
  return config.targetChannelIds.includes(channelId);
}

export function verifyCallbackSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const received = signatureHeader.trim();
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

let cachedAccessToken: CachedAccessToken | null = null;

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildJwtAssertion(config: BotConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: config.clientId,
    sub: config.serviceAccount,
    iat: now,
    exp: now + 60 * 60,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const toSign = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(toSign);
  signer.end();
  const signature = signer.sign(config.privateKeyPem);
  return `${toSign}.${base64UrlEncode(signature)}`;
}

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

async function requestAccessToken(config: BotConfig): Promise<CachedAccessToken> {
  const assertion = buildJwtAssertion(config);
  const body = new URLSearchParams({
    assertion,
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    // bot: 첨부 다운로드/채널 조회 / user.read: 1:1 유저 이름 조회
    scope: "bot user.read",
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LINE WORKS token issuance failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as TokenResponse;
  const expiresInSeconds = payload.expires_in ?? 60 * 60 * 24;
  return {
    token: payload.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000 - ACCESS_TOKEN_SAFETY_WINDOW_MS,
  };
}

export async function issueAccessToken(config: BotConfig): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token;
  }
  cachedAccessToken = await requestAccessToken(config);
  return cachedAccessToken.token;
}

export function clearAccessTokenCache(): void {
  cachedAccessToken = null;
}

export interface AttachmentStreamResult {
  body: ReadableStream<Uint8Array>;
  contentType: string | null;
  contentLength: number | null;
  fileName: string | null;
}

function extractFileNameFromHeader(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const starMatch = /filename\*=(?:UTF-8''|')?([^;]+)/i.exec(header);
  if (starMatch) {
    try {
      return decodeURIComponent(starMatch[1].replace(/^['"]|['"]$/g, ""));
    } catch {
      // fall through
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(header);
  if (plainMatch) {
    return plainMatch[1];
  }
  return null;
}

export async function fetchAttachmentStream(
  config: BotConfig,
  fileId: string,
): Promise<AttachmentStreamResult> {
  const token = await issueAccessToken(config);
  const authHeader = { Authorization: `Bearer ${token}` };

  let currentUrl = ATTACHMENT_URL(config.botId, fileId);
  let response = await fetch(currentUrl, {
    method: "GET",
    headers: authHeader,
    redirect: "manual",
  });

  // LINE WORKS attachment endpoint 302-redirects to apis-storage.worksmobile.com,
  // a different origin. Node's built-in fetch strips the Authorization header on
  // cross-origin redirects, so follow redirects manually and re-attach the token.
  for (let hops = 0; hops < 5; hops += 1) {
    if (response.status < 300 || response.status >= 400) {
      break;
    }
    const location = response.headers.get("location");
    if (!location) {
      break;
    }
    await response.body?.cancel().catch(() => undefined);
    currentUrl = new URL(location, currentUrl).toString();
    response = await fetch(currentUrl, {
      method: "GET",
      headers: authHeader,
      redirect: "manual",
    });
  }

  if (response.status === 401 || response.status === 403) {
    clearAccessTokenCache();
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `LINE WORKS attachment fetch failed (${response.status}): ${text.slice(0, 500)}`,
    );
  }

  const contentType = response.headers.get("content-type");
  const contentLengthRaw = response.headers.get("content-length");
  const disposition = response.headers.get("content-disposition");

  return {
    body: response.body,
    contentType,
    contentLength: contentLengthRaw ? Number(contentLengthRaw) : null,
    fileName: extractFileNameFromHeader(disposition),
  };
}

export interface ChannelInfo {
  channelId: string;
  title: string | null;
  channelType: string | null;
}

interface ChannelInfoResponse {
  channelId?: string;
  title?: string;
  channelType?: { type?: string };
}

export async function fetchChannelInfo(
  config: BotConfig,
  channelId: string,
): Promise<ChannelInfo | null> {
  try {
    const token = await issueAccessToken(config);
    const response = await fetch(CHANNEL_INFO_URL(config.botId, channelId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAccessTokenCache();
      }
      return null;
    }
    const payload = (await response.json()) as ChannelInfoResponse;
    return {
      channelId,
      title: (payload.title ?? "").trim() || null,
      channelType: payload.channelType?.type ?? null,
    };
  } catch {
    return null;
  }
}

interface UserInfoResponse {
  userId?: string;
  userName?: { firstName?: string; lastName?: string };
  email?: string;
}

function combineUserName(user: UserInfoResponse): string | null {
  const name = user.userName;
  if (!name) return null;
  const combined = `${name.lastName ?? ""}${name.firstName ?? ""}`.trim();
  return combined || null;
}

export async function fetchBotScopedUserName(
  config: BotConfig,
  userId: string,
): Promise<string | null> {
  try {
    const token = await issueAccessToken(config);
    const response = await fetch(USER_INFO_URL(userId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAccessTokenCache();
      }
      return null;
    }
    const payload = (await response.json()) as UserInfoResponse;
    return combineUserName(payload);
  } catch {
    return null;
  }
}

const LINK_CANDIDATE_REGEX =
  /\bhttps?:\/\/[^\s<>"']+|(^|[^\w@/.-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{2,5})?(?:\/[^\s<>"']*)?)/gi;
const TRAILING_URL_PUNCTUATION = /[),.;!?'"]+$/g;

function cleanExtractedLink(value: string): string {
  return value.replace(TRAILING_URL_PUNCTUATION, "");
}

export function extractLinksFromText(
  text: string | null | undefined,
): string[] {
  if (!text) {
    return [];
  }

  const links: string[] = [];
  const seen = new Set<string>();
  const addLink = (value: string) => {
    const cleaned = cleanExtractedLink(value);
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    links.push(cleaned);
  };

  for (const match of text.matchAll(LINK_CANDIDATE_REGEX)) {
    addLink(match[2] ?? match[0]);
  }

  return links;
}
