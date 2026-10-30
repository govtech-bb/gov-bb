/**
 * Exclusive page editing (#3108): a numeric page version every save names,
 * and a lease (`page_edit_locks`) only its holder may save or delete under.
 *
 * - `content_pages.version` is the page's shared editor version. It moves
 *   when the live page's content changes, `on update cascade` included, and
 *   when its pending revision is written, reviewed, discarded or dropped, so
 *   two saves made against one version of a page, live or pending, never
 *   both land. Clients send back the version they read; the database alone
 *   moves it, and an update that tries to move it back is ignored.
 * - The version is bookkeeping, not content: `record_change()` neither
 *   compares it nor stores it in a snapshot, and `touch_updated_at()` ignores
 *   it, so a version-only update (a revision step moving it) logs nothing,
 *   keeps `updated_at`, and never makes anyone a contributor.
 * - `page_edit_locks` is presence, not content, so it has no history. A
 *   released lease keeps its row and `lock_generation`, which fences a
 *   delayed acquisition. Deleting the page deletes its lease.
 *
 * Upgrades a database that ran the PR branch's draft `006_page_edit_locks`
 * too: same function, trigger and table names, replaced or renamed in place
 * (its `employee_id` becomes `user_id`) with versions kept.
 *
 * Replay-safe: columns and constraints are added only if missing, functions
 * replaced and triggers dropped and created.
 */
export const SQL = `
alter table content_pages add column if not exists version integer not null default 1;
do $$ begin
  alter table content_pages add constraint content_pages_version_positive check (version > 0);
exception when duplicate_object then null;
end $$;

create or replace function advance_page_content_version() returns trigger as $$
begin
  if to_jsonb(new) - 'updated_at' - 'version' is distinct from to_jsonb(old) - 'updated_at' - 'version' then
    new.version := old.version + 1;
  else
    new.version := greatest(new.version, old.version);
  end if;
  return new;
end;
$$ language plpgsql;
drop trigger if exists content_pages_advance_version on content_pages;
create trigger content_pages_advance_version before update on content_pages
  for each row execute function advance_page_content_version();

create or replace function advance_revised_page_version() returns trigger as $$
begin
  update content_pages set version = version + 1
   where id = coalesce(new.page_id, old.page_id);
  return null;
end;
$$ language plpgsql;
drop trigger if exists page_revisions_advance_page_version on page_revisions;
create trigger page_revisions_advance_page_version
  after insert or update or delete on page_revisions
  for each row execute function advance_revised_page_version();

create or replace function record_change() returns trigger as $$
declare
  kind      text := tg_argv[0];
  old_row   jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) - 'version' end;
  new_row   jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) - 'version' end;
  stored    jsonb := coalesce(new_row, old_row);
  happened  change_action;
begin
  if tg_op = 'INSERT' then
    happened := 'created';
  elsif tg_op = 'DELETE' then
    happened := 'deleted';
  elsif old_row - 'updated_at' = new_row - 'updated_at' then
    return null;
  elsif old_row->>'published_at' is null and new_row->>'published_at' is not null then
    happened := 'published';
  elsif old_row->>'visibility' = 'public' and new_row->>'visibility' <> 'public' then
    happened := 'unpublished';
  elsif old_row->>'visibility' <> 'public' and new_row->>'visibility' = 'public' then
    happened := 'published';
  else
    happened := 'updated';
  end if;

  insert into change_events (entity_kind, entity_id, version_no, action, snapshot, actor)
  select kind, stored->>'id', coalesce(max(version_no), 0) + 1, happened, stored,
         coalesce(nullif(current_setting('app.user_id', true), ''), 'system')
    from change_events
    where entity_kind = kind and entity_id = stored->>'id';
  return null;
end;
$$ language plpgsql;

create or replace function touch_updated_at() returns trigger as $$
begin
  if to_jsonb(new) - 'updated_at' - 'version' = to_jsonb(old) - 'updated_at' - 'version' then
    new.updated_at := old.updated_at;
  elsif new.updated_at = old.updated_at then
    new.updated_at := greatest(
      date_trunc('milliseconds', clock_timestamp()),
      old.updated_at + interval '1 millisecond'
    );
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists page_edit_locks (
  page_id uuid primary key references content_pages(id) on delete cascade,
  lock_generation integer not null check (lock_generation >= 0),
  user_id text,
  holder_name text,
  token uuid,
  acquired_at timestamptz(3),
  lock_expires_at timestamptz(3),
  last_activity_at timestamptz(3),
  activity_sequence bigint
);
do $$ begin
  alter table page_edit_locks rename column employee_id to user_id;
exception when undefined_column then null;
end $$;
alter table page_edit_locks drop constraint if exists page_edit_locks_complete_claim;
alter table page_edit_locks add constraint page_edit_locks_complete_claim check (
  num_nonnulls(user_id, holder_name, token, acquired_at, lock_expires_at, last_activity_at, activity_sequence) in (0, 7)
  and (activity_sequence is null or activity_sequence between 0 and 9007199254740991)
);
`;
