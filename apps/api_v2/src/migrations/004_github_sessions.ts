/** Require a fresh GitHub membership check for sessions created under the Google policy. */
export const SQL = `
delete from auth_session
where not exists (
  select 1 from auth_account
  where auth_account."userId" = auth_session."userId"
    and auth_account."providerId" = 'github'
);
`;
