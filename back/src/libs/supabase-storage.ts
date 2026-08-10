import { Readable } from "node:stream";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  var __workTrackingSupabaseAdmin__: SupabaseClient | undefined;
}

const DEFAULT_BUCKET = "work-tracking-private";

export interface StorageConfig {
  bucket: string;
  prefix: string;
  signedUrlTtlSeconds: number;
}

export function loadStorageConfig(): StorageConfig {
  const rawPrefix = process.env.SUPABASE_STORAGE_PREFIX ?? "line-works/";
  const prefix = rawPrefix.endsWith("/") ? rawPrefix : `${rawPrefix}/`;
  const ttl = Number(
    process.env.SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS || 600,
  );
  return {
    bucket: process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET,
    prefix,
    signedUrlTtlSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : 600,
  };
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (!globalThis.__workTrackingSupabaseAdmin__) {
    const url = process.env.SUPABASE_URL;
    const secretKey =
      process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !secretKey) {
      throw new Error(
        "Supabase Storage is not configured (SUPABASE_URL and SUPABASE_SECRET_KEY are required)",
      );
    }
    globalThis.__workTrackingSupabaseAdmin__ = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return globalThis.__workTrackingSupabaseAdmin__;
}

function sanitizeFileName(fileName: string | undefined): string {
  if (!fileName) return "attachment.bin";
  return sanitizePathSegment(fileName).slice(0, 200);
}

export function sanitizeChannelSegment(segment: string): string {
  return sanitizePathSegment(segment);
}

function sanitizePathSegment(value: string): string {
  return Array.from(value.normalize("NFC"), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || character === "/" || character === "\\"
      ? "_"
      : character;
  }).join("");
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKstDateFolder(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function toDateFolder(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  return toKstDateFolder(Number.isNaN(date.getTime()) ? new Date() : date);
}

function resolveChannelFolder(
  channelId: string,
  channelName: string | null | undefined,
): string {
  const trimmedName = typeof channelName === "string" ? channelName.trim() : "";
  if (trimmedName) {
    const sanitized = sanitizeChannelSegment(trimmedName);
    if (sanitized) return sanitized;
  }
  if (channelId.startsWith("dm:")) {
    const userId = channelId.slice(3);
    return sanitizeChannelSegment(`DM-${userId || "unknown"}`);
  }
  return sanitizeChannelSegment(channelId);
}

export function buildAttachmentObjectPath(params: {
  prefix: string;
  channelId: string;
  channelName?: string | null;
  issuedAt?: string | null;
  fileName?: string;
}): string {
  const channelFolder = resolveChannelFolder(
    params.channelId,
    params.channelName,
  );
  return `${params.prefix}${channelFolder}/${toDateFolder(params.issuedAt)}/${sanitizeFileName(params.fileName)}`;
}

export async function resolveUniqueAttachmentPath(
  basePath: string,
  exists: (path: string) => Promise<boolean>,
): Promise<string> {
  if (!(await exists(basePath))) return basePath;
  const slashIndex = basePath.lastIndexOf("/");
  const directory = slashIndex >= 0 ? basePath.slice(0, slashIndex + 1) : "";
  const name = slashIndex >= 0 ? basePath.slice(slashIndex + 1) : basePath;
  const dotIndex = name.lastIndexOf(".");
  const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex) : "";
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${directory}${stem}(${index})${extension}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${directory}${stem}-${Date.now()}${extension}`;
}

async function bodyToBuffer(
  body: ReadableStream | Readable | Blob | Uint8Array,
): Promise<Buffer> {
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  const reader = (body as ReadableStream).getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function putAttachmentObject(params: {
  path: string;
  body: ReadableStream | Readable | Blob | Uint8Array;
  contentType?: string;
}): Promise<{ bucket: string; path: string }> {
  const config = loadStorageConfig();
  const buffer = await bodyToBuffer(params.body);
  const { data, error } = await getSupabaseAdminClient()
    .storage.from(config.bucket)
    .upload(params.path, buffer, {
      contentType: params.contentType,
      upsert: false,
    });
  if (error)
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  return { bucket: config.bucket, path: data.path };
}

export async function createSignedDownloadUrl(
  bucket: string,
  path: string,
  expiresSeconds?: number,
): Promise<string> {
  const ttl = expiresSeconds ?? loadStorageConfig().signedUrlTtlSeconds;
  const { data, error } = await getSupabaseAdminClient()
    .storage.from(bucket)
    .createSignedUrl(path, ttl);
  if (error)
    throw new Error(`Supabase Storage signing failed: ${error.message}`);
  return data.signedUrl;
}

export async function deleteStorageObject(
  bucket: string,
  path: string,
): Promise<void> {
  const { error } = await getSupabaseAdminClient()
    .storage.from(bucket)
    .remove([path]);
  if (error)
    throw new Error(`Supabase Storage delete failed: ${error.message}`);
}
