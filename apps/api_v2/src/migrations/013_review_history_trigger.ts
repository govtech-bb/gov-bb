/**
 * The review steps of a page's revision, written to the page's history by
 * the database (#3200), as `007` writes its content changes.
 *
 * - `record_review()` runs when a revision's status changes: to `submitted`
 *   (a first submission, or a rejected one submitted again as a new row) it
 *   logs `submitted`; to `rejected`, `rejected`, with the comment in the
 *   snapshot; to `published`, `approved`. The publish's write to the live
 *   page is logged by `record_change` in the same transaction, by the same
 *   approver, so the page's history reads who submitted, who approved, and
 *   the change that went live.
 * - The event is the page's (`content_page`, the page id), numbered after
 *   its last, so one page's history reads in one place. The snapshot is the
 *   revision row, with its submitter, decider and comment. The actor is the
 *   transaction's `app.user_id`, or `system`.
 * - A draft save is not logged: the live page did not change, and the
 *   submission logs what was saved.
 *
 * Replay-safe: the function is replaced and the trigger dropped and created.
 */

export const SQL = `
create or replace function record_review() returns trigger as $$
declare
  happened change_action := case new.status
    when 'submitted' then 'submitted'
    when 'rejected'  then 'rejected'
    when 'published' then 'approved'
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

drop trigger if exists page_revisions_record_review on page_revisions;
create trigger page_revisions_record_review
  after update of status on page_revisions
  for each row when (old.status is distinct from new.status)
  execute function record_review();
`;
