import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

function sanitizeFileName(fileName: string | undefined): string {
  if (!fileName) {
    return "attachment.bin";
  }
  return fileName.replace(/[^\w.\-가-힣\s()\[\]]/g, "_").slice(0, 200);
}

export function buildAttachmentObjectKey(
  prefix: string,
  fileId: string,
  fileName?: string,
): string {
  const safeFileName = sanitizeFileName(fileName);
  return `${prefix}${fileId}/${safeFileName}`;
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
