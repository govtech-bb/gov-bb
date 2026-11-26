/**
 * Who may do what in the editor. This file is the only place that ties a
 * role to a permission.
 */

import { z } from "zod";
import type { Employee, UserId } from "./auth";
import { err, ok, type Result } from "./result";

/**
 * Every permission, with what it lets a person do. The wording completes
 * "You don't have permission to …" and "This role lets you …".
 */
export const PERMISSIONS = {
  "pages:edit":
    "create, change and delete pages, restore an earlier version, and submit a change for review",
  "pages:publish": "publish or reject a change",
  "collections:edit": "add, change and delete collection records",
  "collections:manage": "create a collection",
  "categories:manage": "add, change, move and delete categories",
  "people:read": "see who has signed in and what roles they have",
  "people:manage": "give and take away roles",
} as const;

/** One thing an employee may do. */
export type Permission = keyof typeof PERMISSIONS;

/** What each role holds. Roles don't include each other: an approver is not an editor. */
const ROLE_PERMISSIONS = {
  editor: ["pages:edit", "collections:edit"],
  approver: ["pages:publish", "categories:manage", "collections:manage"],
  admin: ["people:read", "people:manage", "collections:manage"],
} as const satisfies Record<string, readonly Permission[]>;

/** A role, as `user_roles` stores it. */
export type Role = keyof typeof ROLE_PERMISSIONS;

const isRole = (name: string): name is Role =>
  Object.hasOwn(ROLE_PERMISSIONS, name);

/**
 * Every role, in table order. The database check and the API's role list
 * derive from it.
 */
export const ROLES: readonly Role[] =
  Object.keys(ROLE_PERMISSIONS).filter(isRole);

/** Parses a role. */
export const Role = z.enum(ROLES);

/** A permission that at least one role holds. */
type HeldPermission = (typeof ROLE_PERMISSIONS)[Role][number];

const isPermission = (name: string): name is Permission =>
  Object.hasOwn(PERMISSIONS, name);

/**
 * Every permission, in the order PERMISSIONS lists them. Typed as held, so a
 * permission that no role holds doesn't compile.
 */
const HELD_PERMISSIONS: readonly HeldPermission[] =
  Object.keys(PERMISSIONS).filter(isPermission);

/** The permissions a set of roles holds, without repeats, in PERMISSIONS order. */
export function permissionsOf(roles: readonly Role[]): readonly Permission[] {
  const held = new Set<Permission>(
    roles.flatMap((role) => ROLE_PERMISSIONS[role]),
  );
  return HELD_PERMISSIONS.filter((permission) => held.has(permission));
}

/** The roles that hold a permission, in table order. */
export function rolesWith(permission: Permission): readonly Role[] {
  return ROLES.filter((role) =>
    ROLE_PERMISSIONS[role].some((held) => held === permission),
  );
}

/** A role and what it lets a person do, worded for the person. */
export interface RoleDescription {
  readonly role: Role;
  /** One phrase for each permission the role holds, in table order. */
  readonly lets: readonly string[];
}

/** Every role with what it lets a person do. */
export function roleCatalogue(): readonly RoleDescription[] {
  return ROLES.map((role) => ({
    role,
    lets: ROLE_PERMISSIONS[role].map((permission) => PERMISSIONS[permission]),
  }));
}

/** An employee asked for something their roles don't hold. */
export class PermissionDenied extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "PermissionDenied";
  /** The roles that would have allowed it, for the person to ask for. */
  readonly heldBy: readonly Role[];

  /** `attempted` replaces the permission's own words when they are too broad. */
  constructor(
    readonly permission: Permission,
    attempted: string = PERMISSIONS[permission],
  ) {
    const heldBy = rolesWith(permission);
    super(
      `You don't have permission to ${attempted}. Ask an admin for the ${heldBy.join(" or ")} role.`,
    );
    this.heldBy = heldBy;
  }
}

// Not exported, so only `authorize` can construct one. The private member
// stops an object literal, or a spread copy of a real grant with another
// permission or actor, from passing for one.
class Granted<P extends Permission> {
  declare private readonly granted: true;

  constructor(
    readonly actor: UserId,
    readonly permission: P,
  ) {}
}

/**
 * Proof that `authorize` allowed an employee to use a permission. Only
 * `authorize` can make one.
 */
export type Grant<P extends Permission = Permission> = Granted<P>;

/**
 * Decide whether an employee may use a permission. Call it before any write.
 *
 * @param options.to - What the employee is trying to do, for the refusal, when
 *   the permission's own wording is too broad.
 */
export function authorize<P extends Permission>(
  actor: Pick<Employee, "id" | "roles">,
  permission: P,
  options: { readonly to?: string } = {},
): Result<Grant<P>, PermissionDenied> {
  return permissionsOf(actor.roles).includes(permission)
    ? ok(new Granted(actor.id, permission))
    : err(new PermissionDenied(permission, options.to));
}
