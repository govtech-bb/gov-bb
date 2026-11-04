/** Content edit versions are sequence identities, separate from timestamps and audit numbers. */
export const SQL = `
create sequence if not exists content_edit_version_seq as bigint
  maxvalue 9007199254740991 no cycle;

-- Volatile defaults backfill distinct identities without firing row triggers.
alter table content_pages add column if not exists version bigint not null default nextval('content_edit_version_seq');
alter table categories add column if not exists version bigint not null default nextval('content_edit_version_seq');
alter table data_collections add column if not exists version bigint not null default nextval('content_edit_version_seq');
alter table collection_records add column if not exists version bigint not null default nextval('content_edit_version_seq');

create or replace function assign_edit_version() returns trigger as $$
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

-- BEFORE triggers fire in name order; zz_ runs after the touch_* triggers.
drop trigger if exists zz_edit_version on content_pages;
create trigger zz_edit_version before insert or update on content_pages
  for each row execute function assign_edit_version();
drop trigger if exists zz_edit_version on categories;
create trigger zz_edit_version before insert or update on categories
  for each row execute function assign_edit_version();
drop trigger if exists zz_edit_version on data_collections;
create trigger zz_edit_version before insert or update on data_collections
  for each row execute function assign_edit_version();
drop trigger if exists zz_edit_version on collection_records;
create trigger zz_edit_version before insert or update on collection_records
  for each row execute function assign_edit_version();

-- Revision writes change what the editor shows for a page, so they invalidate its version.
create or replace function bump_page_version() returns trigger as $$
begin
  update content_pages set version = nextval('content_edit_version_seq')
   where id = coalesce(new.page_id, old.page_id);
  return null;
end;
$$ language plpgsql;

drop trigger if exists page_revisions_bump_page_version on page_revisions;
create trigger page_revisions_bump_page_version
  after insert or update or delete on page_revisions
  for each row execute function bump_page_version();

create or replace function touch_updated_at() returns trigger as $$
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

  insert into change_events (entity_kind, entity_id, action, snapshot, actor)
  values (kind, stored->>'id', happened, stored,
          coalesce(nullif(current_setting('app.user_id', true), ''), 'system'));
  return null;
end;
$$ language plpgsql;
`;
