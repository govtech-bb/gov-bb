-- What the Drizzle schema cannot describe: the functions and triggers that
-- keep content history, dates and edit versions, and the user they act as.
-- Never edit this file. Change a function with a new custom migration
-- (`pnpm db:generate --custom`) that replaces it.

-- `system` is the actor of every change no employee made. It has no account,
-- so it can never sign in: `.invalid` is a reserved domain, and BetterAuth
-- links users by verified email.
insert into auth_user (id, name, email, "emailVerified")
values ('system', 'System', 'system@api-v2.invalid', false);
--> statement-breakpoint
-- The sequence goes with its column.
alter sequence change_event_order_seq owned by change_events.event_order;
--> statement-breakpoint
-- History is append-only: no update, delete or truncate. The one exception
-- is a redaction. With `app.redacting` on, an update may replace a snapshot
-- with a removal notice (`redacted`, `reason`, `by`), once, changing nothing
-- else on the row.
create function change_events_append_only() returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    if current_setting('app.redacting', true) = 'on'
       and old.snapshot->'redacted' is distinct from 'true'::jsonb
       and new.snapshot = jsonb_build_object(
         'redacted', true,
         'reason', new.snapshot->>'reason',
         'by', new.snapshot->>'by'
       )
       and new.snapshot->>'reason' ~ '[^[:space:]]'
       and new.snapshot->>'by' ~ '[^[:space:]]'
       and (to_jsonb(new) - 'snapshot') is not distinct from (to_jsonb(old) - 'snapshot')
    then
      return new;
    end if;
  end if;
  raise exception 'change_events is append-only (attempted %)', tg_op;
end;
$$ language plpgsql;
--> statement-breakpoint
create trigger change_events_no_mutate
  before update or delete on change_events
  for each row execute function change_events_append_only();
--> statement-breakpoint
-- Row triggers do not run on TRUNCATE, so it has a statement guard too.
create trigger change_events_no_truncate
  before truncate on change_events
  for each statement execute function change_events_append_only();
--> statement-breakpoint
-- Numbers an entity's events 1, 2, 3 from a counter that outlives the entity,
-- so one deleted and created again carries on where it stopped. The counter
-- row serializes content and review writers without locking content rows.
create function allocate_change_event_version() returns trigger as $$
begin
  insert into change_event_counters as c (entity_kind, entity_id, last_version)
  values (new.entity_kind, new.entity_id, 1)
  on conflict (entity_kind, entity_id) do update
    set last_version = c.last_version + 1
  returning last_version into new.version_no;
  return new;
end;
$$ language plpgsql;
--> statement-breakpoint
create trigger allocate_version_no
  before insert on change_events
  for each row execute function allocate_change_event_version();
--> statement-breakpoint
-- Logs every insert, update and delete of a content table, named by the
-- trigger's argument. The actor is the transaction's `app.user_id`, which
-- the editor sets with `set_config(..., true)`, or `system` when nothing set
-- it. An update that changes nothing but `updated_at` or `version` is not
-- logged. A page's update is `published` when it goes public, `unpublished`
-- when it stops being public, and `reverted` when the transaction named the
-- page in `app.restored_page`, with the version it brought back
-- (`app.restored_from`) in `restored_from`. The snapshot is the row as
-- stored, without `version`.
create function record_change() returns trigger as $$
declare
  kind      text := tg_argv[0];
  old_row   jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) - 'version' end;
  new_row   jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) - 'version' end;
  stored    jsonb := coalesce(new_row, old_row);
  restoring boolean := tg_op = 'UPDATE'
    and current_setting('app.restored_page', true) = stored->>'id';
  happened  change_action;
begin
  if tg_op = 'INSERT' then
    happened := 'created';
  elsif tg_op = 'DELETE' then
    happened := 'deleted';
  elsif old_row - 'updated_at' = new_row - 'updated_at' then
    return null;
  elsif restoring then
    happened := 'reverted';
  elsif old_row->>'published_at' is null and new_row->>'published_at' is not null then
    happened := 'published';
  elsif old_row->>'visibility' = 'public' and new_row->>'visibility' <> 'public' then
    happened := 'unpublished';
  elsif old_row->>'visibility' <> 'public' and new_row->>'visibility' = 'public' then
    happened := 'published';
  else
    happened := 'updated';
  end if;

  insert into change_events (entity_kind, entity_id, action, snapshot, actor, restored_from)
  values (kind, stored->>'id', happened, stored,
          coalesce(nullif(current_setting('app.user_id', true), ''), 'system'),
          case when restoring
               then nullif(current_setting('app.restored_from', true), '')::int
          end);
  return null;
end;
$$ language plpgsql;
--> statement-breakpoint
-- Logs the review steps of a page's revision in the page's own history:
-- `submitted`, `rejected`, `approved` (on publish) and `discarded`. The
-- snapshot is the revision row, with its submitter, decider and comment. A
-- draft save is not logged: the live page did not change.
create function record_review() returns trigger as $$
declare
  happened change_action := case new.status
    when 'submitted' then 'submitted'
    when 'rejected'  then 'rejected'
    when 'published' then 'approved'
    when 'discarded' then 'discarded'
  end;
begin
  if happened is null then
    return null;
  end if;

  insert into change_events (entity_kind, entity_id, action, snapshot, actor)
  values ('content_page', new.page_id::text, happened,
          to_jsonb(new), coalesce(nullif(current_setting('app.user_id', true), ''), 'system'));
  return null;
end;
$$ language plpgsql;
--> statement-breakpoint
-- Keeps `updated_at` in step with the row. A save that changes nothing else,
-- or only `version`, keeps the old one: no event is logged, so other editors
-- would never learn of a new value and their next save would conflict. A row
-- changed without it (a sub-page carried to another category by
-- `on update cascade`) gets a new one, so the editor's conflict check sees
-- the change.
create function touch_updated_at() returns trigger as $$
begin
  if to_jsonb(new) - array['updated_at', 'version'] = to_jsonb(old) - array['updated_at', 'version'] then
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
--> statement-breakpoint
-- When what citizens read last changed, for the site's "Last updated" line.
-- Set on insert (to `published_at`, else now) and moved by a change to the
-- title, description, body, frontmatter or form; a visibility, url, slug,
-- category or parent change keeps it. Never earlier than `published_at`.
create function touch_content_updated_at() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.content_updated_at := coalesce(new.published_at, date_trunc('milliseconds', clock_timestamp()));
  elsif (new.title, new.description, new.body_markdown, new.frontmatter, new.form_id)
        is distinct from (old.title, old.description, old.body_markdown, old.frontmatter, old.form_id) then
    new.content_updated_at := greatest(
      date_trunc('milliseconds', clock_timestamp()),
      old.content_updated_at + interval '1 millisecond'
    );
  else
    new.content_updated_at := old.content_updated_at;
  end if;
  if new.published_at is not null then
    new.content_updated_at := greatest(new.content_updated_at, new.published_at);
  end if;
  return new;
end;
$$ language plpgsql;
--> statement-breakpoint
-- Gives a row a new edit version on insert, and on an update that changes
-- anything other than `updated_at`.
create function assign_edit_version() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.version := nextval('content_edit_version_seq');
  elsif new.version is distinct from old.version
     or (to_jsonb(new) - array['version', 'updated_at'])
        is distinct from (to_jsonb(old) - array['version', 'updated_at']) then
    new.version := nextval('content_edit_version_seq');
  end if;
  return new;
end;
$$ language plpgsql;
--> statement-breakpoint
-- Revision writes change what the editor shows for a page, so they move its
-- version without touching its dates or history.
create function bump_page_version() returns trigger as $$
begin
  update content_pages set version = nextval('content_edit_version_seq')
   where id = coalesce(new.page_id, old.page_id);
  return null;
end;
$$ language plpgsql;
--> statement-breakpoint
-- Every content table records its history. A table added later gets
-- `record_change` in the migration that creates it; `migrate.test.ts` fails
-- until it does.
create trigger content_pages_record_change
  after insert or update or delete on content_pages
  for each row execute function record_change('content_page');
--> statement-breakpoint
create trigger categories_record_change
  after insert or update or delete on categories
  for each row execute function record_change('category');
--> statement-breakpoint
create trigger data_collections_record_change
  after insert or update or delete on data_collections
  for each row execute function record_change('data_collection');
--> statement-breakpoint
create trigger collection_records_record_change
  after insert or update or delete on collection_records
  for each row execute function record_change('collection_record');
--> statement-breakpoint
create trigger page_redirects_record_change
  after insert or update or delete on page_redirects
  for each row execute function record_change('page_redirect');
--> statement-breakpoint
create trigger content_pages_touch_updated_at
  before update on content_pages
  for each row execute function touch_updated_at();
--> statement-breakpoint
create trigger categories_touch_updated_at
  before update on categories
  for each row execute function touch_updated_at();
--> statement-breakpoint
create trigger data_collections_touch_updated_at
  before update on data_collections
  for each row execute function touch_updated_at();
--> statement-breakpoint
create trigger collection_records_touch_updated_at
  before update on collection_records
  for each row execute function touch_updated_at();
--> statement-breakpoint
create trigger content_pages_touch_content_updated_at
  before insert or update on content_pages
  for each row execute function touch_content_updated_at();
--> statement-breakpoint
-- BEFORE triggers fire in name order; zz_ runs after the touch_* triggers.
create trigger zz_edit_version before insert or update on content_pages
  for each row execute function assign_edit_version();
--> statement-breakpoint
create trigger zz_edit_version before insert or update on categories
  for each row execute function assign_edit_version();
--> statement-breakpoint
create trigger zz_edit_version before insert or update on collection_records
  for each row execute function assign_edit_version();
--> statement-breakpoint
create trigger page_revisions_record_review
  after update of status on page_revisions
  for each row when (old.status is distinct from new.status)
  execute function record_review();
--> statement-breakpoint
create trigger page_revisions_bump_page_version
  after insert or update or delete on page_revisions
  for each row execute function bump_page_version();
