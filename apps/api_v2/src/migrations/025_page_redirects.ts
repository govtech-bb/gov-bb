/** Page redirect paths outlive page records; replay keeps their audit identities. */
export const SQL = `
create table if not exists page_redirects (
  id uuid primary key default gen_random_uuid(),
  source_url varchar(512) not null,
  destination_url varchar(512) not null,
  constraint page_redirects_source_url_unique unique (source_url),
  constraint page_redirects_not_self check (source_url <> destination_url)
);

create index if not exists page_redirects_destination_url_idx
  on page_redirects (destination_url);

drop trigger if exists page_redirects_record_change on page_redirects;
create trigger page_redirects_record_change
  after insert or update or delete on page_redirects
  for each row execute function record_change('page_redirect');
`;
