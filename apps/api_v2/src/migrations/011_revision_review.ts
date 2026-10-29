/**
 * Review for pending revisions (#3199). An editor submits a draft revision;
 * an approver rejects it with a comment or publishes it to the live page.
 * `submitted_by`/`submitted_at` record the submission, and `decided_by`,
 * `decided_at` and `comment` the rejection or publication.
 *
 * A submitted revision is still open: the page has at most one draft or
 * submitted revision. Rejected and published rows are kept, so a later save
 * starts a new draft beside them.
 *
 * Replay-safe: the columns are added only if missing, and the status check
 * and the open index are dropped and recreated, so a replay leaves them as
 * this script defines them.
 */
export const SQL = `
alter table page_revisions add column if not exists submitted_by text;
alter table page_revisions add column if not exists submitted_at timestamptz(3);
alter table page_revisions add column if not exists decided_by text;
alter table page_revisions add column if not exists decided_at timestamptz(3);
alter table page_revisions add column if not exists comment text;
alter table page_revisions drop constraint if exists page_revisions_status_check;
alter table page_revisions add constraint page_revisions_status_check
  check (status in ('draft', 'submitted', 'rejected', 'published'));
drop index if exists page_revisions_open_page_id_key;
create unique index page_revisions_open_page_id_key
  on page_revisions (page_id) where status in ('draft', 'submitted');
`;
