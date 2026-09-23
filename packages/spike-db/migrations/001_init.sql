-- Block editor spike — initial schema.
--
-- A trimmed subset of the Sprint 1 schema: same table names, same column
-- types, same constraints, so anything learned here transfers. It runs
-- unmodified in PGlite (Postgres 17 in WASM) and in a real Postgres 15+.

create extension if not exists "pgcrypto";

create type page_schema_name as enum ('answer','guide','transaction','finder','calendar');
create type record_status    as enum ('draft','published');
create type change_action    as enum ('created','updated','published','reverted','deleted');

create table content_pages (
  id             uuid primary key default gen_random_uuid(),
  url            varchar(512) not null unique,
  slug           varchar(200) not null,
  schema_name    page_schema_name not null,
  document_type  varchar(60)  not null,
  title          varchar(300) not null,
  description    text,
  is_draft       boolean      not null default false,
  body           jsonb        not null,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now(),

  constraint content_pages_body_shape
    check (body ? 'blocks' and body ? 'refs' and body ? 'version')
);

create table data_collections (
  key             varchar(100) primary key,
  title           varchar(200) not null,
  record_key      varchar(100) not null,
  schema          jsonb        not null,
  schema_version  int          not null default 1,
  updated_at      timestamptz  not null default now()
);

create table collection_records (
  id              uuid primary key default gen_random_uuid(),
  collection_key  varchar(100) not null references data_collections(key) on delete restrict,
  record_key      varchar(200) not null,
  data            jsonb        not null,
  status          record_status not null default 'published',
  updated_at      timestamptz  not null default now(),
  unique (collection_key, record_key)
);
create index collection_records_data_idx
  on collection_records using gin (data jsonb_path_ops);

create table change_events (
  id           uuid primary key default gen_random_uuid(),
  entity_kind  varchar(40) not null,
  entity_id    text        not null,
  version_no   int         not null,
  action       change_action not null,
  snapshot     jsonb       not null,
  actor        text        not null default 'spike',
  occurred_at  timestamptz not null default now(),
  unique (entity_kind, entity_id, version_no)
);

create or replace function change_events_append_only() returns trigger as $$
begin
  raise exception 'change_events is append-only (attempted %)', tg_op;
end;
$$ language plpgsql;

create trigger change_events_no_mutate
  before update or delete on change_events
  for each row execute function change_events_append_only();
