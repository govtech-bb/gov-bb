/**
 * Sign-in moved from GitHub to Google Workspace (#3412). Revoke every session
 * without a linked Google account, so nobody keeps a session the Workspace
 * check never admitted. Users, accounts and roles stay.
 */
export const SQL = `
delete from auth_session
where not exists (
  select 1 from auth_account
  where auth_account."userId" = auth_session."userId"
    and auth_account."providerId" = 'google'
);
`;
