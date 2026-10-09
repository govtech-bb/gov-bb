/**
 * Each page's working copy: what its editors have changed and not yet
 * published. One row per page, replaced by every autosave and deleted when
 * the page is published or the draft is discarded, so `content_pages` stays
 * exactly what the site serves. A draft holds every field a save sends,
 * unchecked until it is published, and goes with its page. It records the
 * page's `updated_at` it was edited from, so a draft of an older version can
 * never quietly replace a newer one.
 */

export const SQL = `
create table if not exists page_drafts (
  page_id         uuid primary key references content_pages(id) on delete cascade,
  draft           jsonb not null,
  base_updated_at timestamptz(3) not null,
  updated_by      text not null,
  updated_at      timestamptz(3) not null default now()
);
`;
