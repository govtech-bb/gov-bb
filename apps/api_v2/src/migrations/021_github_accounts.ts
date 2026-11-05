/**
 * Sign-in is Google only (#3412), so a GitHub account can never sign in
 * again. Delete those links (#3418), the reverse of `004_github_sessions`;
 * users, their roles and their history stay. 020 already revoked the
 * sessions they backed.
 */
export const SQL = `
delete from auth_account where "providerId" = 'github';
`;
