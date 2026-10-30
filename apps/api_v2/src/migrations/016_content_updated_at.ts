/**
 * When a page's content last changed (#3105), for the site's "Last updated"
 * line. `published_at` is when the page first went public and never moves;
 * `updated_at` also moves on a visibility-only change, so neither says when
 * what citizens read last changed.
 *
 * - `content_updated_at` starts as the date the site shows today:
 *   `published_at`, else `created_at`. Nothing changes on screen until a page's
 *   content does. The backfill runs with the table's triggers off: it is not
 *   an edit, so it logs no history and keeps `updated_at`, which every open
 *   editor copy saves against.
 * - `touch_content_updated_at()` sets it on insert (to `published_at`, else
 *   now) and moves it on an update that changes the title, description, body,
 *   frontmatter or form. A visibility, url, slug, category or parent change
 *   keeps it. Publishing a revision writes its fields to the live row, so an
 *   approved change moves it too.
 *
 * Replay-safe: the column is added only if missing, backfilled only where
 * null, and the function and trigger are replaced.
 */

export const SQL = `
alter table content_pages add column if not exists content_updated_at timestamptz(3);

alter table content_pages disable trigger user;
update content_pages
   set content_updated_at = coalesce(published_at, created_at)
 where content_updated_at is null;
alter table content_pages enable trigger user;

alter table content_pages alter column content_updated_at set default now();
alter table content_pages alter column content_updated_at set not null;

create or replace function touch_content_updated_at() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.content_updated_at := coalesce(new.published_at, date_trunc('milliseconds', clock_timestamp()));
  elsif (new.title, new.description, new.body_markdown, new.frontmatter, new.form_id)
        is distinct from (old.title, old.description, old.body_markdown, old.frontmatter, old.form_id) then
    new.content_updated_at := greatest(
      date_trunc('milliseconds', clock_timestamp()),
      old.content_updated_at + interval '1 millisecond'
    );
  else
    new.content_updated_at := old.content_updated_at;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists content_pages_touch_content_updated_at on content_pages;
create trigger content_pages_touch_content_updated_at
  before insert or update on content_pages
  for each row execute function touch_content_updated_at();
`;
