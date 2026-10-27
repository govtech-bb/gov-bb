/**
 * Content history written by the database, attributed to a user or `system`
 * (#3169).
 *
 * - `system` is a user with no account, so it can never sign in: `.invalid`
 *   is a reserved domain, and BetterAuth links users by verified email.
 * - Every actor that is not a user (`spike`, `seed`, `import:…`) becomes
 *   `system`, and `actor` then references `auth_user`. A user with history
 *   cannot be deleted, so an event never loses its author.
 * - `record_change()` logs every insert, update and delete of a content
 *   table. The actor is the transaction's `app.user_id`, which the editor
 *   sets with `set_config(…, true)`, or `system` when nothing set it. An
 *   update that changes nothing but `updated_at` is not logged. The snapshot
 *   is the row as stored, so older events (the editor's page documents) and
 *   newer ones differ in shape.
 * - A page's update is `published` when it goes public and `unpublished`
 *   when it stops being public; a category has no visibility, so its updates
 *   are `updated`.
 * - `touch_updated_at()` moves `updated_at` on a page changed without it — a
 *   sub-page carried to another category by `on update cascade` — so the
 *   editor's conflict check sees the change.
 *
 * A content table added later gets `record_change` in the migration that
 * creates it; `migrate.test.ts` fails until it does.
 */

export const SQL = `
insert into auth_user (id, name, email, "emailVerified")
values ('system', 'System', 'system@api-v2.invalid', false)
on conflict (id) do nothing;

alter table change_events disable trigger change_events_no_mutate;
update change_events set actor = 'system'
  where actor not in (select id from auth_user);
alter table change_events enable trigger change_events_no_mutate;

alter table change_events alter column actor set default 'system';

do $$ begin
  alter table change_events
    add constraint change_events_actor_fkey
      foreign key (actor) references auth_user(id) on delete restrict;
exception when duplicate_object then null;
end $$;

create or replace function record_change() returns trigger as $$
declare
  kind      text := tg_argv[0];
  old_row   jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row   jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
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
  if new.updated_at = old.updated_at
     and to_jsonb(new) - 'updated_at' <> to_jsonb(old) - 'updated_at' then
    new.updated_at := greatest(
      date_trunc('milliseconds', clock_timestamp()),
      old.updated_at + interval '1 millisecond'
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists content_pages_record_change on content_pages;
create trigger content_pages_record_change
  after insert or update or delete on content_pages
  for each row execute function record_change('content_page');

drop trigger if exists content_pages_touch_updated_at on content_pages;
create trigger content_pages_touch_updated_at
  before update on content_pages
  for each row execute function touch_updated_at();

drop trigger if exists categories_record_change on categories;
create trigger categories_record_change
  after insert or update or delete on categories
  for each row execute function record_change('category');
`;
