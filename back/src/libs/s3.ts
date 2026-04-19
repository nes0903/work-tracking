import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

declare global {
  var __workTrackingS3Client__: S3Client | undefined;
}

const DEFAULT_REGION = "ap-northeast-2";

export interface S3Config {
  region: string;
  bucket: string;
  prefix: string;
  presignTtlSeconds: number;
}

export function loadS3Config(): S3Config | null {
  const bucket = process.env.S3_BUCKET_LINE_WORKS;
  if (!bucket) {
    return null;
  }
  const rawPrefix = process.env.S3_OBJECT_PREFIX ?? "line-works/";
  const prefix = rawPrefix.endsWith("/") ? rawPrefix : `${rawPrefix}/`;
  const ttl = Number(process.env.S3_PRESIGN_TTL_SECONDS || 600);
  return {
    region: process.env.AWS_REGION || DEFAULT_REGION,
    bucket,
    prefix,
    presignTtlSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : 600,
  };
}

export function getS3Client(): S3Client {
  if (!globalThis.__workTrackingS3Client__) {
    const config = loadS3Config();
    globalThis.__workTrackingS3Client__ = new S3Client({
      region: config?.region ?? DEFAULT_REGION,
    });
  }
  return globalThis.__workTrackingS3Client__;
}

/**
 * S3 객체 키로 쓰기 전에 파일명을 정제한다.
 * 원본의 한글·공백·괄호·일본어·이모지 등은 **그대로 보존**.
 * S3 경로를 깨뜨리는 경로 구분자(`/`, `\`)와 제어문자만 `_` 로 치환.
 * 저장소에 NFD 로 들어온 한글 자모는 NFC 로 합성하여 저장한다.
 */
function sanitizeFileName(fileName: string | undefined): string {
  if (!fileName) {
    return "attachment.bin";
  }
  // eslint-disable-next-line no-control-regex
  return fileName.normalize("NFC").replace(/[\x00-\x1f/\\]/g, "_").slice(0, 200);
}

export function sanitizeChannelSegment(segment: string): string {
  // eslint-disable-next-line no-control-regex
  return segment.normalize("NFC").replace(/[\x00-\x1f/\\]/g, "_");
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKstDateFolder(date: Date): string {
  // KST(UTC+9) 기준의 YYYY-MM-DD 를 반환.
  // Date 객체에 KST 오프셋을 더한 뒤 toISOString 의 날짜 부분만 잘라 쓴다.
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function toDateFolder(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return toKstDateFolder(new Date());
  }
  return toKstDateFolder(date);
}

export function buildAttachmentObjectKey(params: {
  prefix: string;
  channelId: string;
  /** 있으면 채널 폴더에 이름을 사용. 없으면/빈값이면 channelId 로 fallback. */
  channelName?: string | null;
  issuedAt?: string | null;
  fileName?: string;
  /** 사용되지 않지만 과거 호출부 호환을 위해 남겨둠. */
  fileId?: string;
}): string {
  const { prefix, channelId, channelName, issuedAt, fileName } = params;
  const dateFolder = toDateFolder(issuedAt);
  const channelFolder = resolveChannelFolder(channelId, channelName);
  const safeFileName = sanitizeFileName(fileName);
  // 신규 규칙: <prefix>line-works/<channelName|channelId>/<YYYY-MM-DD>/<fileName>
  // 충돌 방지는 호출부(uploadAttachment)에서 resolveUniqueAttachmentKey 로 처리.
  return `${prefix}${channelFolder}/${dateFolder}/${safeFileName}`;
}

/**
 * channelName 이 유효하면 sanitize 해서 사용, 아니면 channelId 를 sanitize.
 * DM 채널(channelId 가 "dm:..." 형태이고 channelName 이 없으면) 은 "DM-<userId>" 로 대체.
 */
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

/**
 * 같은 날짜·같은 파일명이 이미 존재하는 경우 "name(1).ext", "name(2).ext" 식으로
 * 고유 key 를 만들어낸다. 존재 여부는 호출자가 주입한 `exists(key)` 콜백으로 판단.
 */
export function resolveUniqueAttachmentKey(
  baseKey: string,
  exists: (key: string) => boolean,
): string {
  if (!exists(baseKey)) return baseKey;
  const slashIdx = baseKey.lastIndexOf("/");
  const dir = slashIdx >= 0 ? baseKey.slice(0, slashIdx + 1) : "";
  const name = slashIdx >= 0 ? baseKey.slice(slashIdx + 1) : baseKey;
  const dotIdx = name.lastIndexOf(".");
  const stem = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
  for (let i = 1; i < 1000; i++) {
    const candidate = `${dir}${stem}(${i})${ext}`;
    if (!exists(candidate)) return candidate;
  }
  // 비상: 1000개 이상 충돌 — 타임스탬프 suffix 로 강제 고유화
  return `${dir}${stem}-${Date.now()}${ext}`;
}

async function bodyToBuffer(body: ReadableStream | Readable | Blob | Uint8Array): Promise<Buffer> {
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    const ab = await body.arrayBuffer();
    return Buffer.from(ab);
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
  key: string;
  body: ReadableStream | Readable | Blob | Uint8Array;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}): Promise<{ bucket: string; key: string }> {
  const config = loadS3Config();
  if (!config) {
    throw new Error("S3 is not configured (S3_BUCKET_LINE_WORKS is missing)");
  }

  const buffer = await bodyToBuffer(params.body);

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: params.key,
      Body: buffer,
      ContentType: params.contentType,
      ContentLength: params.contentLength ?? buffer.byteLength,
      Metadata: params.metadata,
    }),
  );

  return { bucket: config.bucket, key: params.key };
}

export async function presignGetUrl(
  bucket: string,
  key: string,
  expiresSeconds?: number,
): Promise<string> {
  const config = loadS3Config();
  const ttl = expiresSeconds ?? config?.presignTtlSeconds ?? 600;
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: ttl },
  );
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key }),
  );
}
