"use client";

import {
  relativeTime,
  type GithubEvent,
  type GithubPullRequest,
  type GithubRepo,
} from "@/lib/work-tracking";

interface GithubRepoCardProps {
  repo: GithubRepo;
}

export function GithubRepoCard({ repo }: GithubRepoCardProps) {
  const prs = Array.isArray(repo.prs) ? repo.prs : [];
  const prEvents = Array.isArray(repo.prEvents) ? repo.prEvents : [];
  const commitEvents = Array.isArray(repo.recentCommitEvents) ? repo.recentCommitEvents : [];

  return (
    <article className="github-repo-card">
      <div className="github-repo-top">
        <div>
          <h4 className="github-repo-name">{repo.repo || "unknown"}</h4>
          <p className="github-repo-branch">{`branch ${repo.defaultBranch || "unknown"}`}</p>
        </div>
        <span className="github-pr-badge">{`Open PR ${repo.openPrCount ?? 0}`}</span>
      </div>

      <p className="github-commit-message">{repo.latestCommit?.message || "최근 커밋 정보 없음"}</p>

      <div className="github-commit-meta">
        <span className="github-commit-sha">
          {repo.latestCommit?.shortSha || repo.latestCommit?.sha?.slice(0, 7) || "-"}
        </span>
        <span className="github-commit-time">
          {repo.latestCommit?.committedAt ? relativeTime(repo.latestCommit.committedAt) : "시간 없음"}
        </span>
      </div>

      <div className="github-repo-links">
        <a
          className="github-commit-link"
          href={repo.latestCommit?.url || repo.repoUrl || "#"}
          target="_blank"
          rel="noreferrer"
        >
          커밋
        </a>
        <a className="github-repo-link" href={repo.repoUrl || "#"} target="_blank" rel="noreferrer">
          레포
        </a>
      </div>

      <div className="github-repo-sections">
        <section className="github-repo-section">
          <header>
            <h5>최근 커밋</h5>
          </header>
          <GithubEventGroup items={commitEvents} emptyMessage="최근 커밋 이벤트가 없습니다." />
        </section>

        <section className="github-repo-section">
          <header>
            <h5>PR 현황</h5>
          </header>
          {prs.length === 0 && prEvents.length === 0 ? (
            <p className="github-event-placeholder">열린 PR이 없습니다.</p>
          ) : (
            <>
              {prs.map((pr) => (
                <GithubPullRequestSummary key={`${repo.repo}-${pr.number}-${pr.title}`} pr={pr} />
              ))}
              <GithubEventGroup items={prEvents} emptyMessage="" />
            </>
          )}
        </section>
      </div>
    </article>
  );
}

function GithubPullRequestSummary({ pr }: { pr: GithubPullRequest }) {
  return (
    <article className="github-pr-summary-item">
      <div>
        <h6 className="github-pr-summary-title">{`#${pr.number} ${pr.title}`}</h6>
        <p className="github-pr-summary-subtitle">
          {[pr.base, pr.head, pr.author, pr.draft ? "draft" : "ready"].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="github-pr-summary-side">
        <span className="github-pr-summary-time">
          {pr.updatedAt ? relativeTime(pr.updatedAt) : "시간 없음"}
        </span>
        <a className="github-pr-summary-link" href={pr.url || "#"} target="_blank" rel="noreferrer">
          {pr.state || "open"}
        </a>
      </div>
    </article>
  );
}

function GithubEventGroup({
  items,
  emptyMessage,
}: {
  items: GithubEvent[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return emptyMessage ? <p className="github-event-placeholder">{emptyMessage}</p> : null;
  }

  return (
    <>
      {items.map((item, index) => (
        <article
          key={`${item.title}-${item.occurredAt}-${index}`}
          className="github-event-item"
        >
          <div className="github-event-main">
            <h6 className="github-event-title">{item.title || "제목 없음"}</h6>
            <p className="github-event-subtitle">
              {[item.kind, item.author, item.status].filter(Boolean).join(" · ") || "메타데이터 없음"}
            </p>
          </div>
          <div className="github-event-side">
            <span className="github-event-time">
              {item.occurredAt ? relativeTime(item.occurredAt) : "시간 없음"}
            </span>
            <a className="github-event-link" href={item.url || "#"} target="_blank" rel="noreferrer">
              열기
            </a>
          </div>
        </article>
      ))}
    </>
  );
}
