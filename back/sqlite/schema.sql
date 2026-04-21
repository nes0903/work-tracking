PRAGMA foreign_keys = ON;

BEGIN;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE IF NOT EXISTS work_days (
  work_date TEXT PRIMARY KEY,
  notes TEXT NOT NULL DEFAULT '',
  focus_minutes INTEGER NOT NULL DEFAULT 0,
  timer_duration_minutes INTEGER NOT NULL DEFAULT 25,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(work_date) = 10),
  CHECK (focus_minutes >= 0),
  CHECK (timer_duration_minutes > 0)
) STRICT;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  work_date TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date TEXT NOT NULL,
  due_time TEXT,
  estimate_minutes INTEGER NOT NULL DEFAULT 30,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  created_by_user_id TEXT,
  assignee_user_id TEXT,
  FOREIGN KEY (work_date) REFERENCES work_days(work_date) ON DELETE CASCADE,
  CHECK (priority IN ('high', 'medium', 'low')),
  CHECK (status IN ('todo', 'doing', 'done')),
  CHECK (estimate_minutes >= 0),
  CHECK (length(due_date) = 10)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_tasks_work_date ON tasks(work_date);
CREATE INDEX IF NOT EXISTS idx_tasks_work_date_status ON tasks(work_date, status);
CREATE INDEX IF NOT EXISTS idx_tasks_work_date_priority ON tasks(work_date, priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date_status ON tasks(due_date, status);

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  work_date TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  source TEXT NOT NULL DEFAULT 'timer',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (work_date) REFERENCES work_days(work_date) ON DELETE CASCADE,
  CHECK (duration_minutes > 0),
  CHECK (source IN ('timer', 'manual', 'import'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_focus_sessions_work_date ON focus_sessions(work_date);

CREATE TABLE IF NOT EXISTS notion_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  synced_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'notion_webhook',
  root_page_url TEXT NOT NULL,
  pages_scanned INTEGER NOT NULL DEFAULT 0,
  pages_changed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  CHECK (status IN ('success', 'partial', 'failed'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_notion_sync_runs_synced_at ON notion_sync_runs(synced_at DESC);

CREATE TABLE IF NOT EXISTS notion_pages_snapshot (
  page_url TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  parent_title TEXT,
  section_title TEXT,
  content_hash TEXT,
  fetched_at TEXT,
  last_scanned_at TEXT,
  last_event_type TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_notion_pages_parent ON notion_pages_snapshot(parent_title);
CREATE INDEX IF NOT EXISTS idx_notion_pages_section ON notion_pages_snapshot(section_title);

CREATE TABLE IF NOT EXISTS notion_update_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  page_url TEXT NOT NULL,
  page_link TEXT NOT NULL,
  title TEXT NOT NULL,
  edited_at TEXT,
  section_title TEXT,
  parent_title TEXT,
  editor_name TEXT,
  summary TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  sync_run_id INTEGER,
  FOREIGN KEY (sync_run_id) REFERENCES notion_sync_runs(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_notion_update_events_page_url ON notion_update_events(page_url);
CREATE INDEX IF NOT EXISTS idx_notion_update_events_received_at ON notion_update_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_notion_update_events_sync_run ON notion_update_events(sync_run_id);

CREATE TABLE IF NOT EXISTS github_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  synced_at TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  repos_scanned INTEGER NOT NULL DEFAULT 0,
  repos_changed INTEGER NOT NULL DEFAULT 0,
  commit_events_detected INTEGER NOT NULL DEFAULT 0,
  pr_events_detected INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  CHECK (status IN ('success', 'partial', 'failed'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_github_sync_runs_synced_at ON github_sync_runs(synced_at DESC);

CREATE TABLE IF NOT EXISTS github_repo_snapshots (
  owner_name TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  latest_commit_sha TEXT,
  latest_commit_at TEXT,
  open_pr_count INTEGER NOT NULL DEFAULT 0,
  last_scanned_at TEXT NOT NULL,
  sync_run_id INTEGER,
  PRIMARY KEY (owner_name, repo_name),
  FOREIGN KEY (sync_run_id) REFERENCES github_sync_runs(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_github_repo_snapshots_scanned_at
  ON github_repo_snapshots(last_scanned_at DESC);

CREATE TABLE IF NOT EXISTS github_pull_request_snapshots (
  owner_name TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  is_draft INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  pr_url TEXT NOT NULL,
  base_branch TEXT,
  head_branch TEXT,
  head_sha TEXT,
  author_name TEXT,
  sync_run_id INTEGER,
  PRIMARY KEY (owner_name, repo_name, pr_number),
  FOREIGN KEY (owner_name, repo_name)
    REFERENCES github_repo_snapshots(owner_name, repo_name)
    ON DELETE CASCADE,
  FOREIGN KEY (sync_run_id) REFERENCES github_sync_runs(id) ON DELETE SET NULL,
  CHECK (is_draft IN (0, 1))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_github_pr_snapshots_updated_at
  ON github_pull_request_snapshots(updated_at DESC);

CREATE TABLE IF NOT EXISTS github_commit_events (
  owner_name TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  title TEXT NOT NULL,
  commit_url TEXT NOT NULL,
  occurred_at TEXT,
  author_name TEXT,
  status TEXT NOT NULL DEFAULT 'recent',
  summary TEXT NOT NULL DEFAULT '',
  sync_run_id INTEGER,
  PRIMARY KEY (owner_name, repo_name, commit_sha),
  FOREIGN KEY (owner_name, repo_name)
    REFERENCES github_repo_snapshots(owner_name, repo_name)
    ON DELETE CASCADE,
  FOREIGN KEY (sync_run_id) REFERENCES github_sync_runs(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_github_commit_events_occurred_at
  ON github_commit_events(occurred_at DESC);

CREATE TABLE IF NOT EXISTS github_pr_events (
  event_uid TEXT PRIMARY KEY,
  owner_name TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  event_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  pr_url TEXT NOT NULL,
  occurred_at TEXT,
  author_name TEXT,
  status TEXT,
  summary TEXT NOT NULL DEFAULT '',
  sync_run_id INTEGER,
  FOREIGN KEY (owner_name, repo_name)
    REFERENCES github_repo_snapshots(owner_name, repo_name)
    ON DELETE CASCADE,
  FOREIGN KEY (sync_run_id) REFERENCES github_sync_runs(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_github_pr_events_occurred_at
  ON github_pr_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_github_pr_events_repo
  ON github_pr_events(owner_name, repo_name, pr_number);

CREATE VIEW IF NOT EXISTS v_today_task_summary AS
SELECT
  work_date,
  COUNT(*) AS total_tasks,
  SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) AS todo_tasks,
  SUM(CASE WHEN status = 'doing' THEN 1 ELSE 0 END) AS doing_tasks,
  SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_tasks,
  SUM(CASE WHEN priority = 'high' AND status <> 'done' THEN 1 ELSE 0 END) AS open_high_priority_tasks,
  SUM(CASE WHEN due_date < work_date AND status <> 'done' THEN 1 ELSE 0 END) AS overdue_tasks
FROM tasks
GROUP BY work_date;

CREATE VIEW IF NOT EXISTS v_github_repo_dashboard AS
SELECT
  s.owner_name,
  s.repo_name,
  s.repo_url,
  s.default_branch,
  s.latest_commit_sha,
  s.latest_commit_at,
  s.open_pr_count,
  COUNT(e.commit_sha) AS tracked_commit_events
FROM github_repo_snapshots AS s
LEFT JOIN github_commit_events AS e
  ON e.owner_name = s.owner_name
 AND e.repo_name = s.repo_name
GROUP BY
  s.owner_name,
  s.repo_name,
  s.repo_url,
  s.default_branch,
  s.latest_commit_sha,
  s.latest_commit_at,
  s.open_pr_count;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  email TEXT,
  domain_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_oauth_states (
  state TEXT PRIMARY KEY,
  redirect_to TEXT NOT NULL DEFAULT '/',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_auth_oauth_states_expires_at ON auth_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS line_works_messages (
  message_id   TEXT PRIMARY KEY,
  channel_id   TEXT NOT NULL,
  user_id      TEXT,
  domain_id    TEXT,
  content_type TEXT NOT NULL,
  text         TEXT,
  issued_at    TEXT,
  raw_json     TEXT NOT NULL,
  received_at  TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_line_works_messages_channel_issued
  ON line_works_messages(channel_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS line_works_attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id  TEXT NOT NULL,
  file_id     TEXT NOT NULL,
  file_name   TEXT,
  file_size   INTEGER,
  mime_type   TEXT,
  s3_bucket   TEXT NOT NULL,
  s3_key      TEXT NOT NULL,
  uploaded_at TEXT,
  FOREIGN KEY (message_id) REFERENCES line_works_messages(message_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_line_works_attachments_message
  ON line_works_attachments(message_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_line_works_attachments_s3_key
  ON line_works_attachments(s3_bucket, s3_key);

CREATE TABLE IF NOT EXISTS line_works_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  url        TEXT NOT NULL,
  found_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (message_id) REFERENCES line_works_messages(message_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_line_works_links_message
  ON line_works_links(message_id);

CREATE TABLE IF NOT EXISTS line_works_channels (
  channel_id       TEXT PRIMARY KEY,
  title            TEXT,
  channel_type     TEXT,
  user_id          TEXT,
  last_fetched_at  TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS user_last_seen (
  user_id       TEXT NOT NULL,
  source        TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, source)
) STRICT;

CREATE TABLE IF NOT EXISTS user_notion_read (
  user_id   TEXT NOT NULL,
  event_id  TEXT NOT NULL,
  read_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, event_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_user_notion_read_user
  ON user_notion_read(user_id, read_at DESC);

CREATE TABLE IF NOT EXISTS users (
  user_id        TEXT PRIMARY KEY,
  user_name      TEXT,
  email          TEXT,
  domain_id      TEXT,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE IF NOT EXISTS task_references (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id        TEXT NOT NULL,
  source         TEXT NOT NULL,
  external_id    TEXT NOT NULL,
  title          TEXT,
  excerpt        TEXT,
  external_url   TEXT,
  metadata_json  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  created_by     TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_task_references_task
  ON task_references(task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_references_source
  ON task_references(source, external_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_references_dedupe
  ON task_references(task_id, source, external_id);

CREATE TABLE IF NOT EXISTS site_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  category   TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_site_links_order ON site_links(sort_order);
-- NOTE: idx_site_links_category 는 sqlite-db.ts runColumnMigrations 에서 category 컬럼
-- ALTER TABLE ADD 이후에 만든다. (구버전 DB에는 category 컬럼이 아직 없을 수 있어 여기서 만들면
-- "no such column: category" 로 부팅이 실패함)

COMMIT;
