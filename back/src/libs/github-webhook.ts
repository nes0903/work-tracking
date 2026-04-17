import { createHmac, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  getGithubFeedFromStore,
  setGithubFeedInStore,
} from "@libs/dashboard-db";
import {
  emptyGithubFeed,
  type GithubEvent,
  type GithubFeed,
  type GithubRepo,
} from "@libs/work-tracking";
import { getDatabase } from "@libs/sqlite-db";
import { emitFeedUpdate } from "@libs/feed-events";

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";
const MAX_FEED_ITEMS = 20;
const MAX_REPO_RECENT_EVENTS = 10;

export interface GithubWebhookHeaders {
  signature: string | null;
  event: string | null;
  deliveryId: string | null;
}

export interface GithubWebhookResult {
  status: number;
  body: {
    ok: boolean;
    error?: string;
    event?: string;
    ignored?: boolean;
    reason?: string;
    accepted?: boolean;
    summary?: {
      repo?: string;
      commits?: number;
      pullRequest?: {
        number: number;
        action: string;
      };
    };
  };
}

interface GithubRepositoryPayload {
  full_name?: string;
  name?: string;
  html_url?: string;
  default_branch?: string;
  open_issues_count?: number;
  owner?: { login?: string };
}

interface GithubCommitPayload {
  id?: string;
  message?: string;
  url?: string;
  timestamp?: string;
  author?: { name?: string; username?: string };
  committer?: { name?: string; username?: string };
}

interface GithubPushPayload {
  ref?: string;
  before?: string;
  after?: string;
  repository?: GithubRepositoryPayload;
  pusher?: { name?: string };
  sender?: { login?: string };
  commits?: GithubCommitPayload[];
  head_commit?: GithubCommitPayload | null;
}

interface GithubPullRequestPayload {
  action?: string;
  number?: number;
  pull_request?: {
    number?: number;
    title?: string;
    html_url?: string;
    state?: string;
    draft?: boolean;
    merged?: boolean;
    updated_at?: string;
    base?: { ref?: string };
    head?: { ref?: string; sha?: string };
    user?: { login?: string };
  };
  repository?: GithubRepositoryPayload;
  sender?: { login?: string };
}

interface GithubPingPayload {
  zen?: string;
  hook_id?: number;
  repository?: GithubRepositoryPayload;
}

export async function handleGithubWebhook(
  rawBody: string,
  headers: GithubWebhookHeaders,
): Promise<GithubWebhookResult> {
  if (!GITHUB_WEBHOOK_SECRET) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "GITHUB_WEBHOOK_SECRET is not configured",
      },
    };
  }

  if (!verifyGithubSignature(rawBody, headers.signature)) {
    return {
      status: 401,
      body: { ok: false, error: "Invalid GitHub signature" },
    };
  }

  const payload = safeJsonParse(rawBody);
  if (!payload || typeof payload !== "object") {
    return {
      status: 400,
      body: { ok: false, error: "Invalid JSON body" },
    };
  }

  const event = headers.event ?? "unknown";
  const deliveryId = headers.deliveryId ?? null;

  if (event === "ping") {
    return {
      status: 200,
      body: {
        ok: true,
        accepted: true,
        event,
        summary: {
          repo: (payload as GithubPingPayload).repository?.full_name,
        },
      },
    };
  }

  if (event === "push") {
    return handlePushEvent(payload as GithubPushPayload);
  }

  if (event === "pull_request") {
    return handlePullRequestEvent(
      payload as GithubPullRequestPayload,
      deliveryId,
    );
  }

  return {
    status: 200,
    body: {
      ok: true,
      ignored: true,
      event,
      reason: "Unsupported event type",
    },
  };
}

function verifyGithubSignature(rawBody: string, headerValue: string | null) {
  if (typeof headerValue !== "string" || !headerValue.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", GITHUB_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(headerValue);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function handlePushEvent(payload: GithubPushPayload): GithubWebhookResult {
  const repo = payload.repository;
  if (!repo?.name || !repo.owner?.login) {
    return {
      status: 400,
      body: { ok: false, error: "Missing repository info in push payload" },
    };
  }

  const ownerName = repo.owner.login;
  const repoName = repo.name;
  const repoUrl =
    repo.html_url ?? `https://github.com/${ownerName}/${repoName}`;
  const defaultBranch = repo.default_branch ?? "main";
  const branch = extractBranchFromRef(payload.ref);
  const commits = payload.commits ?? [];

  const db = getDatabase();
  const syncRunId = insertSyncRun(db, {
    ownerName,
    reposScanned: 1,
    reposChanged: commits.length > 0 ? 1 : 0,
    commitEventsDetected: commits.length,
    prEventsDetected: 0,
  });

  const storedCommits: GithubEvent[] = [];

  for (const commit of commits) {
    if (!commit.id) continue;
    const commitUrl = commit.url ?? `${repoUrl}/commit/${commit.id}`;
    const title = (commit.message ?? "").split("\n", 1)[0];
    const author =
      commit.author?.username ??
      commit.author?.name ??
      commit.committer?.username ??
      commit.committer?.name ??
      null;
    const occurredAt = commit.timestamp ?? null;

    upsertCommitEvent(db, {
      ownerName,
      repoName,
      commitSha: commit.id,
      title: title || commit.id.slice(0, 7),
      commitUrl,
      occurredAt,
      authorName: author,
      syncRunId,
    });

    storedCommits.push({
      title: title || commit.id.slice(0, 7),
      kind: "commit",
      author: author ?? undefined,
      status: branch === defaultBranch ? "default" : "branch",
      occurredAt: occurredAt ?? undefined,
      url: commitUrl,
    });
  }

  const latestCommit = payload.head_commit ?? commits[commits.length - 1];

  upsertRepoSnapshot(db, {
    ownerName,
    repoName,
    repoUrl,
    defaultBranch,
    latestCommitSha: latestCommit?.id ?? null,
    latestCommitAt: latestCommit?.timestamp ?? null,
    openPrCount: repo.open_issues_count ?? 0,
    syncRunId,
  });

  applyPushToFeed({
    ownerName,
    repoName,
    repoUrl,
    defaultBranch,
    latestCommit: latestCommit ?? null,
    commitEvents: storedCommits,
  });

  return {
    status: 200,
    body: {
      ok: true,
      accepted: true,
      event: "push",
      summary: {
        repo: `${ownerName}/${repoName}`,
        commits: storedCommits.length,
      },
    },
  };
}

function handlePullRequestEvent(
  payload: GithubPullRequestPayload,
  deliveryId: string | null,
): GithubWebhookResult {
  const repo = payload.repository;
  const pr = payload.pull_request;
  if (!repo?.name || !repo.owner?.login || !pr?.number) {
    return {
      status: 400,
      body: { ok: false, error: "Missing repository or PR info" },
    };
  }

  const ownerName = repo.owner.login;
  const repoName = repo.name;
  const repoUrl =
    repo.html_url ?? `https://github.com/${ownerName}/${repoName}`;
  const defaultBranch = repo.default_branch ?? "main";
  const action = payload.action ?? "updated";
  const prUrl = pr.html_url ?? `${repoUrl}/pull/${pr.number}`;
  const title = pr.title ?? `PR #${pr.number}`;
  const prState = pr.merged ? "merged" : (pr.state ?? "open");
  const author = pr.user?.login ?? null;
  const updatedAt = pr.updated_at ?? null;

  const db = getDatabase();
  const syncRunId = insertSyncRun(db, {
    ownerName,
    reposScanned: 1,
    reposChanged: 1,
    commitEventsDetected: 0,
    prEventsDetected: 1,
  });

  upsertRepoSnapshot(db, {
    ownerName,
    repoName,
    repoUrl,
    defaultBranch,
    latestCommitSha: null,
    latestCommitAt: null,
    openPrCount: repo.open_issues_count ?? 0,
    syncRunId,
    preserveCommitFields: true,
  });

  upsertPullRequestSnapshot(db, {
    ownerName,
    repoName,
    prNumber: pr.number,
    title,
    state: prState,
    isDraft: pr.draft ? 1 : 0,
    updatedAt,
    prUrl,
    baseBranch: pr.base?.ref ?? null,
    headBranch: pr.head?.ref ?? null,
    headSha: pr.head?.sha ?? null,
    authorName: author,
    syncRunId,
  });

  const eventUid =
    deliveryId ||
    `${ownerName}/${repoName}#${pr.number}:${action}:${updatedAt ?? ""}`;
  upsertPullRequestEvent(db, {
    eventUid,
    ownerName,
    repoName,
    prNumber: pr.number,
    eventKind: action,
    title,
    prUrl,
    occurredAt: updatedAt,
    authorName: author,
    status: prState,
    summary: `PR ${action}`,
    syncRunId,
  });

  applyPrEventToFeed({
    ownerName,
    repoName,
    repoUrl,
    defaultBranch,
    prEvent: {
      title: `#${pr.number} ${title}`,
      kind: `pr.${action}`,
      author: author ?? undefined,
      status: prState,
      occurredAt: updatedAt ?? undefined,
      url: prUrl,
    },
  });

  return {
    status: 200,
    body: {
      ok: true,
      accepted: true,
      event: "pull_request",
      summary: {
        repo: `${ownerName}/${repoName}`,
        pullRequest: {
          number: pr.number,
          action,
        },
      },
    },
  };
}

function extractBranchFromRef(ref: string | undefined) {
  if (!ref) return null;
  const prefix = "refs/heads/";
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
}

interface SyncRunInput {
  ownerName: string;
  reposScanned: number;
  reposChanged: number;
  commitEventsDetected: number;
  prEventsDetected: number;
}

function insertSyncRun(db: DatabaseSync, input: SyncRunInput): number {
  const result = db
    .prepare(
      `
        INSERT INTO github_sync_runs (
          synced_at, owner_name, repos_scanned, repos_changed,
          commit_events_detected, pr_events_detected, status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'success')
      `,
    )
    .run(
      new Date().toISOString(),
      input.ownerName,
      input.reposScanned,
      input.reposChanged,
      input.commitEventsDetected,
      input.prEventsDetected,
    );
  return Number(result.lastInsertRowid);
}

interface CommitEventInput {
  ownerName: string;
  repoName: string;
  commitSha: string;
  title: string;
  commitUrl: string;
  occurredAt: string | null;
  authorName: string | null;
  syncRunId: number;
}

function upsertCommitEvent(db: DatabaseSync, input: CommitEventInput) {
  db.prepare(
    `
      INSERT INTO github_commit_events (
        owner_name, repo_name, commit_sha, title, commit_url,
        occurred_at, author_name, status, summary, sync_run_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'recent', '', ?)
      ON CONFLICT(owner_name, repo_name, commit_sha) DO UPDATE SET
        title = excluded.title,
        commit_url = excluded.commit_url,
        occurred_at = excluded.occurred_at,
        author_name = excluded.author_name,
        sync_run_id = excluded.sync_run_id
    `,
  ).run(
    input.ownerName,
    input.repoName,
    input.commitSha,
    input.title,
    input.commitUrl,
    input.occurredAt,
    input.authorName,
    input.syncRunId,
  );
}

interface RepoSnapshotInput {
  ownerName: string;
  repoName: string;
  repoUrl: string;
  defaultBranch: string;
  latestCommitSha: string | null;
  latestCommitAt: string | null;
  openPrCount: number;
  syncRunId: number;
  preserveCommitFields?: boolean;
}

function upsertRepoSnapshot(db: DatabaseSync, input: RepoSnapshotInput) {
  const updateCommitClause = input.preserveCommitFields
    ? ""
    : `
        latest_commit_sha = excluded.latest_commit_sha,
        latest_commit_at = excluded.latest_commit_at,`;

  db.prepare(
    `
      INSERT INTO github_repo_snapshots (
        owner_name, repo_name, repo_url, default_branch,
        latest_commit_sha, latest_commit_at, open_pr_count,
        last_scanned_at, sync_run_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_name, repo_name) DO UPDATE SET
        repo_url = excluded.repo_url,
        default_branch = excluded.default_branch,${updateCommitClause}
        open_pr_count = excluded.open_pr_count,
        last_scanned_at = excluded.last_scanned_at,
        sync_run_id = excluded.sync_run_id
    `,
  ).run(
    input.ownerName,
    input.repoName,
    input.repoUrl,
    input.defaultBranch,
    input.latestCommitSha,
    input.latestCommitAt,
    input.openPrCount,
    new Date().toISOString(),
    input.syncRunId,
  );
}

interface PullRequestSnapshotInput {
  ownerName: string;
  repoName: string;
  prNumber: number;
  title: string;
  state: string;
  isDraft: 0 | 1;
  updatedAt: string | null;
  prUrl: string;
  baseBranch: string | null;
  headBranch: string | null;
  headSha: string | null;
  authorName: string | null;
  syncRunId: number;
}

function upsertPullRequestSnapshot(
  db: DatabaseSync,
  input: PullRequestSnapshotInput,
) {
  db.prepare(
    `
      INSERT INTO github_pull_request_snapshots (
        owner_name, repo_name, pr_number, title, state, is_draft,
        updated_at, pr_url, base_branch, head_branch, head_sha,
        author_name, sync_run_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_name, repo_name, pr_number) DO UPDATE SET
        title = excluded.title,
        state = excluded.state,
        is_draft = excluded.is_draft,
        updated_at = excluded.updated_at,
        pr_url = excluded.pr_url,
        base_branch = excluded.base_branch,
        head_branch = excluded.head_branch,
        head_sha = excluded.head_sha,
        author_name = excluded.author_name,
        sync_run_id = excluded.sync_run_id
    `,
  ).run(
    input.ownerName,
    input.repoName,
    input.prNumber,
    input.title,
    input.state,
    input.isDraft,
    input.updatedAt,
    input.prUrl,
    input.baseBranch,
    input.headBranch,
    input.headSha,
    input.authorName,
    input.syncRunId,
  );
}

interface PullRequestEventInput {
  eventUid: string;
  ownerName: string;
  repoName: string;
  prNumber: number;
  eventKind: string;
  title: string;
  prUrl: string;
  occurredAt: string | null;
  authorName: string | null;
  status: string | null;
  summary: string;
  syncRunId: number;
}

function upsertPullRequestEvent(
  db: DatabaseSync,
  input: PullRequestEventInput,
) {
  db.prepare(
    `
      INSERT INTO github_pr_events (
        event_uid, owner_name, repo_name, pr_number, event_kind,
        title, pr_url, occurred_at, author_name, status, summary, sync_run_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_uid) DO UPDATE SET
        event_kind = excluded.event_kind,
        title = excluded.title,
        pr_url = excluded.pr_url,
        occurred_at = excluded.occurred_at,
        author_name = excluded.author_name,
        status = excluded.status,
        summary = excluded.summary,
        sync_run_id = excluded.sync_run_id
    `,
  ).run(
    input.eventUid,
    input.ownerName,
    input.repoName,
    input.prNumber,
    input.eventKind,
    input.title,
    input.prUrl,
    input.occurredAt,
    input.authorName,
    input.status,
    input.summary,
    input.syncRunId,
  );
}

interface ApplyPushInput {
  ownerName: string;
  repoName: string;
  repoUrl: string;
  defaultBranch: string;
  latestCommit: GithubCommitPayload | null;
  commitEvents: GithubEvent[];
}

function applyPushToFeed(input: ApplyPushInput) {
  const current = getGithubFeedFromStore() ?? emptyGithubFeed();
  const next = updateFeedRepoAndItems(current, {
    ownerName: input.ownerName,
    repoName: input.repoName,
    repoUrl: input.repoUrl,
    defaultBranch: input.defaultBranch,
    commitPatch: input.latestCommit
      ? {
          message: input.latestCommit.message?.split("\n", 1)[0],
          shortSha: input.latestCommit.id?.slice(0, 7),
          sha: input.latestCommit.id,
          committedAt: input.latestCommit.timestamp,
          url:
            input.latestCommit.url ??
            (input.latestCommit.id
              ? `${input.repoUrl}/commit/${input.latestCommit.id}`
              : undefined),
        }
      : null,
    newCommitEvents: input.commitEvents,
    newPrEvents: [],
  });
  setGithubFeedInStore(next);
  emitFeedUpdate("github");
}

interface ApplyPrInput {
  ownerName: string;
  repoName: string;
  repoUrl: string;
  defaultBranch: string;
  prEvent: GithubEvent;
}

function applyPrEventToFeed(input: ApplyPrInput) {
  const current = getGithubFeedFromStore() ?? emptyGithubFeed();
  const next = updateFeedRepoAndItems(current, {
    ownerName: input.ownerName,
    repoName: input.repoName,
    repoUrl: input.repoUrl,
    defaultBranch: input.defaultBranch,
    commitPatch: null,
    newCommitEvents: [],
    newPrEvents: [input.prEvent],
  });
  setGithubFeedInStore(next);
  emitFeedUpdate("github");
}

interface UpdateFeedInput {
  ownerName: string;
  repoName: string;
  repoUrl: string;
  defaultBranch: string;
  commitPatch: GithubRepo["latestCommit"] | null;
  newCommitEvents: GithubEvent[];
  newPrEvents: GithubEvent[];
}

function updateFeedRepoAndItems(
  feed: GithubFeed,
  input: UpdateFeedInput,
): GithubFeed {
  const repoFullName = `${input.ownerName}/${input.repoName}`;
  const existingRepos = [...(feed.repos ?? [])];
  const existingIndex = existingRepos.findIndex(
    (item) => item.repo === repoFullName,
  );
  const existingRepo: GithubRepo =
    existingIndex >= 0 ? existingRepos[existingIndex] : {};

  const mergedCommitEvents = mergeEvents(
    input.newCommitEvents,
    existingRepo.recentCommitEvents ?? [],
    MAX_REPO_RECENT_EVENTS,
  );
  const mergedPrEvents = mergeEvents(
    input.newPrEvents,
    existingRepo.prEvents ?? [],
    MAX_REPO_RECENT_EVENTS,
  );

  const updatedRepo: GithubRepo = {
    ...existingRepo,
    repo: repoFullName,
    defaultBranch: input.defaultBranch,
    repoUrl: input.repoUrl,
    latestCommit: input.commitPatch ?? existingRepo.latestCommit,
    recentCommitEvents: mergedCommitEvents,
    prEvents: mergedPrEvents,
  };

  if (existingIndex >= 0) {
    existingRepos[existingIndex] = updatedRepo;
  } else {
    existingRepos.unshift(updatedRepo);
  }

  const combinedNewItems = [...input.newCommitEvents, ...input.newPrEvents];
  const newItems = combinedNewItems.length
    ? mergeEvents(combinedNewItems, feed.items ?? [], MAX_FEED_ITEMS)
    : (feed.items ?? []);

  return {
    lastSyncedAt: new Date().toISOString(),
    repos: existingRepos,
    items: newItems,
  };
}

function mergeEvents(
  incoming: GithubEvent[],
  existing: GithubEvent[],
  cap: number,
): GithubEvent[] {
  if (!incoming.length) {
    return existing.slice(0, cap);
  }

  const seen = new Set<string>();
  const merged: GithubEvent[] = [];

  for (const list of [incoming, existing]) {
    for (const entry of list) {
      const key = `${entry.url ?? ""}|${entry.occurredAt ?? ""}|${entry.title ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(entry);
      if (merged.length >= cap) return merged;
    }
  }

  return merged;
}
