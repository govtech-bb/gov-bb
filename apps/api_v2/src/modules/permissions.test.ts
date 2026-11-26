import { assert, describe, expect, expectTypeOf, it } from "vitest";
import { UserId } from "./auth";
import {
  authorize,
  PermissionDenied,
  permissionsOf,
  ROLES,
  roleCatalogue,
  rolesWith,
  type Grant,
  type Permission,
  type Role,
} from "./permissions";
import { expectOk } from "../test-db";

/** Who may use each permission, written by permission, the other way round from the table. */
const ALLOWED = {
  "pages:edit": ["editor"],
  "pages:publish": ["approver"],
  "collections:edit": ["editor"],
  "collections:manage": ["approver", "admin"],
  "categories:manage": ["approver"],
  "people:read": ["admin"],
  "people:manage": ["admin"],
} as const satisfies Record<Permission, readonly Role[]>;

const EVERY_PERMISSION = Object.keys(ALLOWED).filter(
  (name): name is Permission => name in ALLOWED,
);

/** Every set of roles, from none to all. */
const ROLE_SETS = ROLES.reduce<Role[][]>(
  (sets, role) => [...sets, ...sets.map((set) => [...set, role])],
  [[]],
);

const actor = (roles: readonly Role[]) => ({
  id: UserId.parse("someone"),
  roles,
});

describe("the permissions table", () => {
  it("lists the roles in table order", () => {
    expect(ROLES).toEqual(["editor", "approver", "admin"]);
  });

  describe.each(
    ROLE_SETS.map((roles) => ({
      name: roles.join(" + ") || "no roles",
      roles,
    })),
  )("$name", ({ roles }) => {
    it.each(EVERY_PERMISSION)("%s", (permission) => {
      const allowed = ALLOWED[permission].some((role) => roles.includes(role));

      expect(authorize(actor(roles), permission).ok).toBe(allowed);
      expect(permissionsOf(roles).includes(permission)).toBe(allowed);
    });
  });

  it("doesn't let an approver edit pages", () => {
    expect(authorize(actor(["approver"]), "pages:edit").ok).toBe(false);
  });

  it("adds roles up without repeats, in the order PERMISSIONS lists them", () => {
    expect(permissionsOf(["admin", "approver"])).toEqual([
      "pages:publish",
      "collections:manage",
      "categories:manage",
      "people:read",
      "people:manage",
    ]);
  });

  it("names the roles that hold a permission", () => {
    expect(rolesWith("collections:manage")).toEqual(["approver", "admin"]);
    expect(rolesWith("pages:edit")).toEqual(["editor"]);
  });

  it("describes each role in words", () => {
    expect(roleCatalogue()).toEqual([
      {
        role: "editor",
        lets: [
          "create, change and delete pages, restore an earlier version, and submit a change for review",
          "add, change and delete collection records",
        ],
      },
      {
        role: "approver",
        lets: [
          "publish or reject a change",
          "add, change, move and delete categories",
          "create a collection",
        ],
      },
      {
        role: "admin",
        lets: [
          "see who has signed in and what roles they have",
          "give and take away roles",
          "create a collection",
        ],
      },
    ]);
  });
});

describe("authorize", () => {
  it("grants a permission the employee's roles hold", () => {
    expect(expectOk(authorize(actor(["editor"]), "pages:edit"))).toMatchObject({
      actor: "someone",
      permission: "pages:edit",
    });
  });

  it("refuses with the permission's words and the roles that hold it", () => {
    const refused = authorize(actor(["editor"]), "collections:manage");

    assert(!refused.ok);
    expect(refused.error).toBeInstanceOf(PermissionDenied);
    expect(refused.error).toMatchObject({
      _tag: "PermissionDenied",
      permission: "collections:manage",
      heldBy: ["approver", "admin"],
      message:
        "You don't have permission to create a collection. Ask an admin for the approver or admin role.",
    });
  });

  it("names what the employee tried, when given", () => {
    const refused = authorize(actor([]), "pages:publish", {
      to: "change whether a public page shows its Start link",
    });

    assert(!refused.ok);
    expect(refused.error.message).toBe(
      "You don't have permission to change whether a public page shows its Start link. Ask an admin for the approver role.",
    );
  });

  it("doesn't compile a permission or role outside the table, or a grant made by hand", () => {
    const employee = actor(["editor"]);

    // @ts-expect-error: "pages:delete" isn't a permission.
    expect(authorize(employee, "pages:delete").ok).toBe(false);
    // @ts-expect-error: "superuser" isn't a role.
    expect(permissionsOf(["superuser"])).toEqual([]);
    expectTypeOf({
      actor: employee.id,
      permission: "pages:edit",
    } as const).not.toExtend<Grant<"pages:edit">>();
  });
});
