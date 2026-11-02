/** Row triggers do not run on TRUNCATE; the history needs a statement guard too. */
export const SQL = `
drop trigger if exists change_events_no_truncate on change_events;
create trigger change_events_no_truncate
  before truncate on change_events
  for each statement execute function change_events_append_only();
`;
