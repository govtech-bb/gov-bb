/**
 * Data collections and their records, back again (#3183): facts many pages
 * repeat, such as a department's phone number, kept once. `001_init` had
 * these tables and `002_markdown_pages` dropped them; this is their shape now.
 *
 * - `data_collections.schema` is the collection's field list,
 *   `{ "fields": [{ "key", "label", "type" }] }`, the shape of block-kit's
 *   `CollectionDefinition`. A developer sets it, in a migration or the seed;
 *   editors change records, not field lists. Records are not migrated with
 *   it: a change that removes or renames a field must rewrite
 *   `collection_records.data` too, or those records can't be saved as they are.
 * - `collection_records.data` is one record, checked against that field list
 *   by the API on every write. A record belongs to its collection by
 *   `collection_key`, and a collection with records cannot be deleted.
 * - Both carry an `id`, because `record_change()` (`007`) names the entity it
 *   logs by `id`. The records' history is kept like a page's: every insert,
 *   update and delete, with the actor.
 *
 * Replay-safe: `create table if not exists`, with the keys inline, and each
 * trigger dropped and created.
 */

export const SQL = `
create table if not exists data_collections (
  id              uuid primary key default gen_random_uuid(),
  key             varchar(100) not null unique,
  title           varchar(200) not null,
  record_key      varchar(100) not null,
  schema          jsonb        not null,
  schema_version  int          not null default 1,
  created_at      timestamptz(3) not null default now(),
  updated_at      timestamptz(3) not null default now()
);

create table if not exists collection_records (
  id              uuid primary key default gen_random_uuid(),
  collection_key  varchar(100) not null
    references data_collections (key) on delete restrict,
  record_key      varchar(200) not null,
  data            jsonb        not null,
  created_at      timestamptz(3) not null default now(),
  updated_at      timestamptz(3) not null default now(),
  constraint collection_records_collection_key_record_key_key
    unique (collection_key, record_key)
);

drop trigger if exists data_collections_record_change on data_collections;
create trigger data_collections_record_change
  after insert or update or delete on data_collections
  for each row execute function record_change('data_collection');

drop trigger if exists data_collections_touch_updated_at on data_collections;
create trigger data_collections_touch_updated_at
  before update on data_collections
  for each row execute function touch_updated_at();

drop trigger if exists collection_records_record_change on collection_records;
create trigger collection_records_record_change
  after insert or update or delete on collection_records
  for each row execute function record_change('collection_record');

drop trigger if exists collection_records_touch_updated_at on collection_records;
create trigger collection_records_touch_updated_at
  before update on collection_records
  for each row execute function touch_updated_at();
`;
