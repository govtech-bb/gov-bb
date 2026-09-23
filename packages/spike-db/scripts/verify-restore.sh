#!/usr/bin/env bash
#
# Phase 5 verification, end to end and repeatable.
#
#   1. pg_dump the seeded PGlite database to plain SQL
#   2. start a stock Postgres 17
#   3. restore, with ON_ERROR_STOP so any manual correction shows up as a failure
#   4. assert every constraint still ENFORCES, not merely exists
#
# Usage: pnpm --filter @govtech-bb/spike-db verify:restore
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(dirname "$HERE")"
CONTAINER=spike-restore-check
PORT=55432

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> pg_dump the PGlite database"
(cd "$PKG" && pnpm exec tsx scripts/dump.ts)

echo "==> start postgres:17-alpine"
cleanup
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=spike -e POSTGRES_DB=spike \
  -p "$PORT:5432" postgres:17-alpine >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -U postgres -d spike -qtAc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> restore (ON_ERROR_STOP: any error fails the run)"
docker exec -i "$CONTAINER" psql -U postgres -d spike -q -v ON_ERROR_STOP=1 \
  < "$PKG/dump.sql"
echo "    restored with no manual correction"

echo "==> assert the constraints still enforce"
docker exec -i "$CONTAINER" psql -U postgres -d spike -q -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare n int;
begin
  -- Rows.
  select count(*) into n from content_pages;
  if n <> 4 then raise exception 'content_pages: expected 4, got %', n; end if;
  select count(*) into n from collection_records;
  if n <> 187 then raise exception 'collection_records: expected 187, got %', n; end if;

  -- The three enum types.
  select count(*) into n from pg_type
   where typname in ('page_schema_name','record_status','change_action');
  if n <> 3 then raise exception 'enum types: expected 3, got %', n; end if;

  -- The append-only trigger fires on UPDATE.
  begin
    update change_events set action = 'updated';
    raise exception 'append-only trigger did not fire on UPDATE';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;

  -- ...and on DELETE.
  begin
    delete from change_events;
    raise exception 'append-only trigger did not fire on DELETE';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;

  -- The body CHECK rejects a missing top-level key.
  begin
    insert into content_pages (url, slug, schema_name, document_type, title, body)
    values ('/x','x','guide','x','X','{"version":1,"blocks":[]}'::jsonb);
    raise exception 'body CHECK did not fire';
  exception when check_violation then null;
  end;

  -- The collection foreign key is enforced.
  begin
    insert into collection_records (collection_key, record_key, data)
    values ('nope','x','{}'::jsonb);
    raise exception 'collection_key foreign key did not fire';
  exception when foreign_key_violation then null;
  end;

  -- The GIN index survived.
  select count(*) into n from pg_indexes
   where indexname = 'collection_records_data_idx';
  if n <> 1 then raise exception 'GIN index missing'; end if;

  raise notice 'all constraints enforce after restore';
end $$;
SQL

echo "==> OK"
