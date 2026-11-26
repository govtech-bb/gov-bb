/**
 * What api_v2's table lets each role do, so a fixture can name someone by role and answer GET /editor/me as the API
 * does. The editor itself knows no role: it reads only the permissions.
 */
const ROLE_PERMISSIONS = new Map([
  ["reader", ["content:read"]],
  ["editor", ["pages:edit", "collections:edit"]],
  ["approver", ["pages:publish", "categories:manage", "collections:manage"]],
  ["admin", ["people:read", "people:manage", "collections:manage"]],
]);

/** The permissions `roles` hold, Reader's included, as GET /editor/me lists them. */
export function permissionsOf(roles: readonly string[]): string[] {
  return [...new Set(["reader", ...roles].flatMap((role) => ROLE_PERMISSIONS.get(role) ?? []))];
}
