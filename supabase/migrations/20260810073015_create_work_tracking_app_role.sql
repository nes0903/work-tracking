begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'work_tracking_app') then
    create role work_tracking_app login;
  end if;
end;
$$;

alter role work_tracking_app set search_path = public;
alter role work_tracking_app set statement_timeout = '30s';
alter role work_tracking_app set lock_timeout = '10s';
alter role work_tracking_app set idle_in_transaction_session_timeout = '15s';

grant connect on database postgres to work_tracking_app;
grant usage on schema public to work_tracking_app;

grant select, insert, update, delete on table
  public.app_settings,
  public.work_days,
  public.tasks,
  public.task_assignees,
  public.focus_sessions,
  public.notion_sync_runs,
  public.notion_pages_snapshot,
  public.notion_update_events,
  public.github_sync_runs,
  public.github_repo_snapshots,
  public.github_pull_request_snapshots,
  public.github_commit_events,
  public.github_pr_events,
  public.auth_sessions,
  public.auth_oauth_states,
  public.line_works_messages,
  public.line_works_attachments,
  public.line_works_links,
  public.line_works_link_previews,
  public.line_works_channels,
  public.user_last_seen,
  public.user_notion_read,
  public.users,
  public.task_references,
  public.site_links,
  public.site_link_categories,
  public.feed_events
to work_tracking_app;

grant select on table
  public.v_today_task_summary,
  public.v_github_repo_dashboard
to work_tracking_app;

grant usage, select, update on sequence
  public.notion_sync_runs_id_seq,
  public.github_sync_runs_id_seq,
  public.line_works_attachments_id_seq,
  public.line_works_links_id_seq,
  public.task_references_id_seq,
  public.site_links_id_seq,
  public.feed_events_id_seq
to work_tracking_app;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'app_settings', 'work_days', 'tasks', 'task_assignees', 'focus_sessions',
    'notion_sync_runs', 'notion_pages_snapshot', 'notion_update_events',
    'github_sync_runs', 'github_repo_snapshots', 'github_pull_request_snapshots',
    'github_commit_events', 'github_pr_events', 'auth_sessions', 'auth_oauth_states',
    'line_works_messages', 'line_works_attachments', 'line_works_links',
    'line_works_link_previews', 'line_works_channels', 'user_last_seen',
    'user_notion_read', 'users', 'task_references', 'site_links',
    'site_link_categories', 'feed_events'
  ]
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'work_tracking_server_access'
    ) then
      execute format(
        'create policy work_tracking_server_access on public.%I for all to work_tracking_app using (true) with check (true)',
        target_table
      );
    end if;
  end loop;
end;
$$;

commit;
