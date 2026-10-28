/**
 * A revision discarded unreviewed (#3203). An approver can take a public page
 * out of public view while a change to it waits for review; the waiting
 * revision is closed as `discarded`, recording who discarded it in
 * `decided_by`/`decided_at`, and `record_review()` logs a `discarded` step to
 * the page's history, as `013` logs the other review steps.
 *
 * One script: the new `change_action` value is only named inside the
 * trigger's body, which Postgres does not resolve until the trigger runs, so
 * nothing uses the value in the transaction that adds it.
 *
 * Replay-safe: the enum value is added only if missing, the status check is
 * dropped and recreated, and the function is replaced.
 */

export const SQL = `
alter type change_action add value if not exists 'discarded';

alter table page_revisions drop constraint if exists page_revisions_status_check;
alter table page_revisions add constraint page_revisions_status_check
  check (status in ('draft', 'submitted', 'rejected', 'published', 'discarded'));

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

  insert into change_events (entity_kind, entity_id, version_no, action, snapshot, actor)
  select 'content_page', new.page_id::text, coalesce(max(version_no), 0) + 1, happened,
         to_jsonb(new), coalesce(nullif(current_setting('app.user_id', true), ''), 'system')
    from change_events
    where entity_kind = 'content_page' and entity_id = new.page_id::text;
  return null;
end;
$$ language plpgsql;
`;
