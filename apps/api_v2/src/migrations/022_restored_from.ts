/**
 * A page restored to an earlier version of its history (#3231, ADR 0080) is
 * a new change, not a rewind: `record_change()` logs it as `reverted`, with
 * the version it restored in `restored_from`. Every earlier event stays.
 *
 * - The restore sets `app.restored_page` and `app.restored_from` for its
 *   transaction. Only that page's update is `reverted`: a sub-page the same
 *   save files under its category is `updated`, as on any save.
 * - `restored_from` is null on every other event.
 * - The rest of `record_change()` is as `007` wrote it.
 *
 * Replay-safe: the column is added only if missing, and the function is
 * replaced.
 */

export const SQL = `
alter table change_events add column if not exists restored_from int;

create or replace function record_change() returns trigger as $$
declare
  kind      text := tg_argv[0];
  old_row   jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row   jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
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

  insert into change_events
    (entity_kind, entity_id, version_no, action, snapshot, actor, restored_from)
  select kind, stored->>'id', coalesce(max(version_no), 0) + 1, happened, stored,
         coalesce(nullif(current_setting('app.user_id', true), ''), 'system'),
         case when restoring
              then nullif(current_setting('app.restored_from', true), '')::int
         end
    from change_events
    where entity_kind = kind and entity_id = stored->>'id';
  return null;
end;
$$ language plpgsql;
`;
