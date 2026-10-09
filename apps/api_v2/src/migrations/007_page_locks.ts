/**
 * Who is editing each page. An editor claims a page when they start editing
 * and keeps it while they work; a claim nobody has touched for five minutes
 * has lapsed. While someone holds it, anyone else's drafts and saves of that
 * page are refused unless they take over. The holder's name is copied in, so
 * the editor can say who it is without a session lookup.
 */

export const SQL = `
create table if not exists page_locks (
  page_id      uuid primary key references content_pages(id) on delete cascade,
  holder_id    text not null,
  holder_name  text not null,
  holder_email text not null,
  touched_at   timestamptz(3) not null default now()
);
`;
