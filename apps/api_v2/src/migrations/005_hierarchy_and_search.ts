/**
 * The navigation the site lists from, and the text its search indexes.
 *
 * - `categories.parent_id` makes a subcategory a category with a parent, and
 *   `position` is the order the site lists them in.
 * - `content_pages.parent_id` is the page hierarchy. A page with none sits at
 *   the root of its category and is what a category lists; one with a parent
 *   (a `/start` step, a sub-page) is not. The url is only the address: the
 *   hierarchy is never read from it. A page shares its parent's category,
 *   enforced by the composite key, and moving a parent to another category
 *   carries its sub-pages with it (`on update cascade`). The plain key on
 *   `parent_id` alone is what checks a parent exists when `category_id` is
 *   null, which the composite key, MATCH SIMPLE, skips.
 * - `search_chunks` holds each page's body split at its headings, as the
 *   plain text search indexes. `tsv` is unused until search ranks in
 *   Postgres; it is generated so it can never disagree with `body`.
 * - `forms` goes: form status comes from the forms API, so a page's
 *   `form_id` is just a name.
 *
 * Like `002`, the content tables are cleared the first time this runs (when
 * `parent_id` is not there yet). Their rows are the seed corpus, which was
 * loaded without a hierarchy — every `/start` step would otherwise list as a
 * service — and the seed refills them, structured, on the next boot. A replay
 * finds `parent_id` present and clears nothing.
 */

export const SQL = `
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'content_pages' and column_name = 'parent_id'
  ) then
    delete from content_pages;
    delete from categories;
  end if;
end $$;

alter table categories
  add column if not exists parent_id uuid
    references categories(id) on delete restrict,
  add column if not exists position integer not null default 0;

alter table content_pages
  drop constraint if exists content_pages_form_id_fkey;
drop table if exists forms;

alter table content_pages
  add column if not exists parent_id uuid
    references content_pages(id) on delete restrict;

do $$ begin
  alter table content_pages
    add constraint content_pages_id_category_id_key unique (id, category_id);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table content_pages
    add constraint content_pages_parent_category_fkey
      foreign key (parent_id, category_id)
      references content_pages (id, category_id)
      on update cascade on delete restrict;
exception when duplicate_object then null;
end $$;

create index if not exists content_pages_parent_id_idx
  on content_pages (parent_id);
create index if not exists content_pages_category_id_idx
  on content_pages (category_id);

create table if not exists search_chunks (
  id       uuid primary key default gen_random_uuid(),
  page_id  uuid not null references content_pages(id) on delete cascade,
  ordinal  integer not null,
  heading  text,
  body     text not null,
  tsv      tsvector generated always as (
             to_tsvector('english', coalesce(heading, '') || ' ' || body)
           ) stored,
  unique (page_id, ordinal)
);

create index if not exists search_chunks_tsv_idx
  on search_chunks using gin (tsv);
`;
