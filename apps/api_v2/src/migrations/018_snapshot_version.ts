/** Set the default after adding the column so legacy snapshots stay unlabeled. */
export const SQL = `
alter table change_events add column if not exists snapshot_version integer;
alter table change_events alter column snapshot_version set default 1;
`;
