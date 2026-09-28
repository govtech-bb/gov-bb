/**
 * api_v2 initial schema.
 *
 * The same DDL as the block editor spike's `001_init`, made idempotent. Every
 * statement can run against a database that already has it: re-landing a
 * bare `ADD COLUMN` is what crash-looped the API on boot with 42701 after a
 * revert, and a migration that cannot be run twice is a migration that fails
 * the first time anyone retries a deploy.
 *
 * `create type` has no IF NOT EXISTS, so the enums go through a DO block.
 *
 * Timestamps are `timestamptz(3)`, not bare `timestamptz`, which is the one
 * place this deliberately differs from the browser spike's copy. Postgres
 * stores microseconds; `Date.prototype.toISOString()` emits milliseconds. So
 * `updated_at` went out over the wire as .914Z, came back as .914Z, and never
 * equalled the stored .914123 — every optimistic-concurrency check failed and
 * every save looked like a conflict. PGlite rounds to milliseconds, so the
 * tests passed and only a real Postgres showed it. Storing what the wire
 * format can actually represent removes the mismatch rather than papering
 * over it with a tolerance.
 *
 * No `create extension pgcrypto`, unlike the spike's copy: `gen_random_uuid()`
 * has been in core Postgres since 13, so the extension was never doing any
 * work here. It is also unavailable in some PGlite builds, which is how the
 * redundancy surfaced — the tests could not create a database at all.
 *
 * The DDL is a TypeScript string rather than a `.sql` file read at runtime
 * because this app compiles to CommonJS and its tests run as ESM: the two
 * spell "the directory this file is in" differently (`__dirname` against
 * `import.meta.url`) and only one of them exists at a time. A string has no
 * directory, so it is the same migration in the build, in the tests and
 * under `tsx`. `schema.test.ts` is what keeps it honest against the Drizzle
 * definition.
 */

export const SQL = `
do $$ begin
  create type page_schema_name as enum ('answer','guide','transaction','finder','calendar');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type record_status as enum ('draft','published');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type change_action as enum ('created','updated','published','reverted','deleted');
exception when duplicate_object then null;
end $$;

create table if not exists content_pages (
  id             uuid primary key default gen_random_uuid(),
  url            varchar(512) not null unique,
  slug           varchar(200) not null,
  schema_name    page_schema_name not null,
  document_type  varchar(60)  not null,
  title          varchar(300) not null,
  description    text,
  is_draft       boolean      not null default false,
  body           jsonb        not null,
  created_at     timestamptz(3) not null default now(),
  updated_at     timestamptz(3) not null default now(),

  constraint content_pages_body_shape
    check (body ? 'blocks' and body ? 'refs' and body ? 'version')
);

create table if not exists data_collections (
  key             varchar(100) primary key,
  title           varchar(200) not null,
  record_key      varchar(100) not null,
  schema          jsonb        not null,
  schema_version  int          not null default 1,
  updated_at      timestamptz(3) not null default now()
);

create table if not exists collection_records (
  id              uuid primary key default gen_random_uuid(),
  collection_key  varchar(100) not null references data_collections(key) on delete restrict,
  record_key      varchar(200) not null,
  data            jsonb        not null,
  status          record_status not null default 'published',
  updated_at      timestamptz(3) not null default now(),
  constraint collection_records_collection_key_record_key_key
    unique (collection_key, record_key)
);

create index if not exists collection_records_data_idx
  on collection_records using gin (data jsonb_path_ops);

create table if not exists change_events (
  id           uuid primary key default gen_random_uuid(),
  entity_kind  varchar(40) not null,
  entity_id    text        not null,
  version_no   int         not null,
  action       change_action not null,
  snapshot     jsonb       not null,
  actor        text        not null default 'spike',
  occurred_at  timestamptz(3) not null default now(),
  constraint change_events_entity_kind_entity_id_version_no_key
    unique (entity_kind, entity_id, version_no)
);

create or replace function change_events_append_only() returns trigger as $$
begin
  raise exception 'change_events is append-only (attempted %)', tg_op;
end;
$$ language plpgsql;

drop trigger if exists change_events_no_mutate on change_events;
create trigger change_events_no_mutate
  before update or delete on change_events
  for each row execute function change_events_append_only();
`;
