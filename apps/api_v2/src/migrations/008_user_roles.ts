/**
 * Who may do more than edit. An employee holds a row per role: `approver`
 * may change what citizens see, `admin` may grant and revoke roles, and
 * `editor` is reserved for #3197. A row goes with its user. `granted_by` is
 * the admin who granted it, or null for one granted from
 * `API_V2_ADMIN_EMAILS`.
 *
 * Numbered 008 because 006 and 007 are taken by the change history work
 * (#3340); the runner applies whatever it has not recorded, in order.
 */
export const SQL = `
create table if not exists user_roles (
  user_id    text not null references auth_user (id) on delete cascade,
  role       text not null check (role in ('editor', 'approver', 'admin')),
  granted_by text,
  granted_at timestamptz(3) not null default now(),
  primary key (user_id, role)
);
`;
