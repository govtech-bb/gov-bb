-- Older releases replay migrations absent from this ledger. In particular,
-- 002_markdown_pages drops collection tables, so fresh databases need it too.
create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
--> statement-breakpoint
insert into schema_migrations (name) values
  ('001_init'),
  ('002_markdown_pages'),
  ('003_auth'),
  ('004_github_sessions'),
  ('005_hierarchy_and_search'),
  ('006_change_action_unpublished'),
  ('007_change_history_trigger'),
  ('008_user_roles'),
  ('009_default_editor_role'),
  ('010_page_revisions'),
  ('011_revision_review'),
  ('012_change_action_review'),
  ('013_review_history_trigger'),
  ('014_data_collections'),
  ('015_revision_discarded'),
  ('016_content_updated_at'),
  ('017_change_events_no_truncate'),
  ('018_snapshot_version'),
  ('019_change_events_redaction'),
  ('020_google_sessions'),
  ('021_github_accounts'),
  ('022_restored_from'),
  ('023_change_event_counters'),
  ('024_edit_versions'),
  ('025_page_redirects'),
  ('026_change_event_order')
on conflict (name) do nothing;
