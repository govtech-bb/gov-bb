/**
 * Every employee is an editor by default (ADR 0079). From now on api_v2
 * grants the role when it creates a user at their first sign-in; this grants
 * it to everyone who signed in before that, with no grantor.
 *
 * Replaying it is safe for the schema but not for a revocation: run again,
 * it would give the role back to everyone an admin took it from. The runner
 * records it in `schema_migrations`, so it runs once. Two instances booting
 * together can both run it, moments apart, which is before anyone could
 * revoke a role.
 */
export const SQL = `
insert into user_roles (user_id, role)
select id, 'editor' from auth_user
on conflict do nothing;
`;
