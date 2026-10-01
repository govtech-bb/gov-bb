/**
 * Pages as markdown, with a taxonomy and a form gate.
 *
 * The revision of `001_init` drawn in the proposed ERD: `categories` and
 * `forms` are added, and `content_pages` stores `body_markdown` plus the hast
 * compiled from it in place of the block document (ADR 0074's block document
 * comes back later, as a change of its own). `visibility` replaces `is_draft`,
 * and the collection tables go, with `record_status` and `page_schema_name`.
 *
 * Idempotent like `001_init`, for the same reason: every statement tolerates
 * being replayed against a database that already has it.
 *
 * A block document cannot be turned into markdown, so a database still holding
 * them has its pages deleted before the new NOT NULL columns land. The rows
 * are the seed corpus, not authored content (nothing here is reachable from
 * anywhere but a laptop, see the README), and the seed refills the estate on
 * the next boot. `change_events` keeps its history: it is append-only, and
 * its link to a page was only ever logical.
 */

export const SQL = `
do $$ begin
  create type page_visibility as enum ('public','preview','draft');
exception when duplicate_object then null;
end $$;

create table if not exists categories (
  id           uuid primary key default gen_random_uuid(),
  slug         varchar(100) not null unique,
  title        varchar(200) not null,
  description  text,
  created_at   timestamptz(3) not null default now(),
  updated_at   timestamptz(3) not null default now()
);

create table if not exists forms (
  form_id     varchar(100) primary key,
  visibility  page_visibility not null default 'draft'
);

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'content_pages' and column_name = 'body'
  ) then
    delete from content_pages;
  end if;
end $$;

alter table content_pages drop constraint if exists content_pages_body_shape;

alter table content_pages
  drop column if exists body,
  drop column if exists schema_name,
  drop column if exists document_type,
  drop column if exists is_draft;

alter table content_pages
  add column if not exists category_id uuid
    references categories(id) on delete restrict,
  add column if not exists visibility page_visibility not null default 'draft',
  add column if not exists form_id varchar(100)
    references forms(form_id) on delete restrict,
  add column if not exists body_markdown text not null,
  add column if not exists hast jsonb not null,
  add column if not exists frontmatter jsonb not null default '{}'::jsonb,
  add column if not exists published_at timestamptz(3);

drop table if exists collection_records;
drop table if exists data_collections;
drop type if exists record_status;
drop type if exists page_schema_name;
`;
