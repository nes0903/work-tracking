import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  getGithubFeedFromStore,
  getNotionFeedFromStore,
  setGithubFeedInStore,
  setNotionFeedInStore,
} from "@libs/dashboard-db";
import {
  emptyGithubFeed,
  emptyNotionFeed,
  type GithubFeed,
  type NotionFeed,
} from "@libs/work-tracking";
import { getJsonSetting, setJsonSetting } from "@libs/sqlite-db";

const NOTION_UPDATES_PATH = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "notion-updates.json",
);
const NOTION_SNAPSHOT_PATH = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "notion-snapshot.json",
);
const GITHUB_UPDATES_PATH = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "github-updates.json",
);
const GITHUB_SNAPSHOT_PATH = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "github-snapshot.json",
);

export async function syncLegacyNotionFeedToStore() {
  const filePayload = await readJsonFile<NotionFeed>(NOTION_UPDATES_PATH);
  const storedFeed = getNotionFeedFromStore();
  if (
    filePayload &&
    isIncomingFeedNewer(
      filePayload.lastSyncedAt ?? null,
      storedFeed?.lastSyncedAt ?? null,
    )
  ) {
    setNotionFeedInStore({
      lastSyncedAt: filePayload.lastSyncedAt ?? null,
      items: Array.isArray(filePayload.items) ? filePayload.items : [],
    });
  }

  const snapshotPayload = await readJsonFile<unknown>(NOTION_SNAPSHOT_PATH);
  const storedSnapshot = getJsonSetting<{ lastScannedAt?: string | null }>(
    "notion_snapshot_payload",
  );
  if (
    snapshotPayload &&
    isIncomingFeedNewer(
      extractTimestamp(snapshotPayload, "lastScannedAt"),
      storedSnapshot?.lastScannedAt ?? null,
    )
  ) {
    setJsonSetting("notion_snapshot_payload", snapshotPayload);
  }
}

export async function syncLegacyGithubFeedToStore() {
  const filePayload = await readJsonFile<GithubFeed>(GITHUB_UPDATES_PATH);
  const storedFeed = getGithubFeedFromStore();
  if (
    filePayload &&
    isIncomingFeedNewer(
      filePayload.lastSyncedAt ?? null,
      storedFeed?.lastSyncedAt ?? null,
    )
  ) {
    setGithubFeedInStore({
      lastSyncedAt: filePayload.lastSyncedAt ?? null,
      repos: Array.isArray(filePayload.repos) ? filePayload.repos : [],
      items: Array.isArray(filePayload.items) ? filePayload.items : [],
    });
  }

  const snapshotPayload = await readJsonFile<unknown>(GITHUB_SNAPSHOT_PATH);
  const storedSnapshot = getJsonSetting<{ lastScannedAt?: string | null }>(
    "github_snapshot_payload",
  );
  if (
    snapshotPayload &&
    isIncomingFeedNewer(
      extractTimestamp(snapshotPayload, "lastScannedAt"),
      storedSnapshot?.lastScannedAt ?? null,
    )
  ) {
    setJsonSetting("github_snapshot_payload", snapshotPayload);
  }
}

export async function getNotionFeed() {
  await syncLegacyNotionFeedToStore();
  return getNotionFeedFromStore() ?? emptyNotionFeed();
}

export async function getGithubFeed() {
  await syncLegacyGithubFeedToStore();
  return getGithubFeedFromStore() ?? emptyGithubFeed();
}

export function setNotionSnapshot(snapshot: unknown) {
  setJsonSetting("notion_snapshot_payload", snapshot);
}

export function getNotionSnapshot<T>() {
  return getJsonSetting<T>("notion_snapshot_payload");
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function isIncomingFeedNewer(incoming: string | null, current: string | null) {
  if (!incoming) {
    return current == null;
  }

  if (!current) {
    return true;
  }

  return new Date(incoming).getTime() >= new Date(current).getTime();
}

function extractTimestamp(value: unknown, field: string) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const timestamp = (value as Record<string, unknown>)[field];
  return typeof timestamp === "string" ? timestamp : null;
}
