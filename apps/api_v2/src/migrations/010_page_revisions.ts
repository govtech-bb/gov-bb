/**
 * A change to a public page waits here, as a pending revision, until an
 * approver publishes it (#3198); the live row in `content_pages` and its
 * search chunks are untouched until then. `fields` is the page as the save
 * sent it. `live_updated_at` is the live page's version the revision was last
 * saved over. `contributors` is everyone who saved to it, none of whom may
 * approve it (ADR 0079). A page has at most one open revision; a later save
 * updates it. #3199 adds the statuses after `draft`, and widens the index to
 * whichever of them are open.
 */
export const SQL = `
create table if not exists page_revisions (
  id              uuid primary key default gen_random_uuid(),
  page_id         uuid not null references content_pages (id) on delete cascade,
  status          text not null default 'draft' check (status in ('draft')),
  fields          jsonb not null,
  live_updated_at timestamptz(3) not null,
  created_by      text not null,
  contributors    text[] not null,
  created_at      timestamptz(3) not null default now(),
  updated_at      timestamptz(3) not null default now()
);
create unique index if not exists page_revisions_open_page_id_key
  on page_revisions (page_id) where status = 'draft';
`;
