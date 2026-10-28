/** Content versions advance at the database boundary; edit-lock activity never updates content rows. */
export const SQL = /* sql */ `
alter table content_pages add column if not exists version integer not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'content_pages_version_positive' and conrelid = 'content_pages'::regclass) then
    alter table content_pages add constraint content_pages_version_positive check (version > 0);
  end if;
end $$;

create or replace function advance_page_content_version() returns trigger language plpgsql as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
drop trigger if exists content_pages_advance_version on content_pages;
create trigger content_pages_advance_version before update on content_pages
for each row execute function advance_page_content_version();

create table if not exists page_edit_locks (
  page_id uuid primary key references content_pages(id) on delete cascade,
  lock_generation integer not null check (lock_generation >= 0),
  employee_id text,
  holder_name text,
  token uuid,
  acquired_at timestamptz(3),
  lock_expires_at timestamptz(3),
  last_activity_at timestamptz(3),
  activity_sequence bigint,
  constraint page_edit_locks_complete_claim check (
    num_nonnulls(employee_id, holder_name, token, acquired_at, lock_expires_at, last_activity_at, activity_sequence) in (0, 7)
    and (activity_sequence is null or activity_sequence between 0 and 9007199254740991)
  )
);
`;
