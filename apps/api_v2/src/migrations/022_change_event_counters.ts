/** Serialize audit numbering across content and review writes without locking content rows. */
export const SQL = `
lock table change_events in exclusive mode;

create table if not exists change_event_counters (
  entity_kind  varchar(40) not null,
  entity_id    text        not null,
  last_version integer    not null,
  primary key (entity_kind, entity_id)
);

-- Include deleted entities and redacted snapshots; replay must never rewind a counter.
insert into change_event_counters as c (entity_kind, entity_id, last_version)
select entity_kind, entity_id, max(version_no)
  from change_events
  group by entity_kind, entity_id
on conflict (entity_kind, entity_id) do update
  set last_version = greatest(c.last_version, excluded.last_version);

create or replace function allocate_change_event_version() returns trigger as $$
begin
  insert into change_event_counters as c (entity_kind, entity_id, last_version)
  values (new.entity_kind, new.entity_id, 1)
  on conflict (entity_kind, entity_id) do update
    set last_version = c.last_version + 1
  returning last_version into new.version_no;
  return new;
end;
$$ language plpgsql;

drop trigger if exists allocate_version_no on change_events;
create trigger allocate_version_no
  before insert on change_events
  for each row execute function allocate_change_event_version();

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

  insert into change_events (entity_kind, entity_id, action, snapshot, actor)
  values (kind, stored->>'id', happened, stored,
          coalesce(nullif(current_setting('app.user_id', true), ''), 'system'));
  return null;
end;
$$ language plpgsql;

create or replace function record_review() returns trigger as $$
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
`;
