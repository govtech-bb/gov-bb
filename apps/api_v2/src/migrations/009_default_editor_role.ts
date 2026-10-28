/**
 * Every employee is an editor by default (ADR 0079). From now on api_v2
 * grants the role when it creates a user at their first sign-in; this grants
 * it to everyone who signed in before that, with no grantor. The `system`
 * user (007) can never sign in, so it gets none.
 *
 * Replayed, it would give the role back to everyone an admin took it from,
 * so it guards itself rather than relying on the runner skipping it. The
 * runner sends this script after its advisory lock and before recording
 * `009_default_editor_role` in `schema_migrations`, all in one transaction:
 * the first run sees no record and grants, and any later run (an instance
 * that lost the boot race for the lock, or a replay) sees the record and
 * grants nothing.
 *
 * During a rolling deploy, someone's first sign-in can land on an old task,
 * which has no create hook, after this has run. They get no editor row. An
 * admin grants it: `PUT /editor/employees/:id/roles/editor`.
 */
export const SQL = `
insert into user_roles (user_id, role)
select id, 'editor' from auth_user
where id <> 'system'
and not exists (
  select 1 from schema_migrations where name = '009_default_editor_role'
)
on conflict do nothing;
`;
