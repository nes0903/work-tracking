create index if not exists idx_github_commit_events_sync_run_id
  on public.github_commit_events (sync_run_id);

create index if not exists idx_github_pr_events_sync_run_id
  on public.github_pr_events (sync_run_id);

create index if not exists idx_github_pull_request_snapshots_sync_run_id
  on public.github_pull_request_snapshots (sync_run_id);

create index if not exists idx_github_repo_snapshots_sync_run_id
  on public.github_repo_snapshots (sync_run_id);
