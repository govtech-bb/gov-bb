/**
 * Role history (#3705): every role given or taken away, including one given
 * by email before a first sign-in and the ones API_V2_ADMIN_EMAILS gives,
 * adds one row to the audit history, which a revoke's record outlives. Role
 * changes aren't content, so the site's version stays as it was.
 */

import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PostgresRoles } from "./adapters/postgres-roles";
import type { Database } from "./db";
import { UserId, type Employee } from "./modules/auth";
import { Redacted } from "./modules/redacted";
import { ok } from "./modules/result";
import { EditorAccess } from "./services/editor-access";
import {
  aPage,
  createTestApp,
  createTestDb,
  expectOk,
  requestAs,
  sessionsFor,
  TEST_EDITOR,
  TEST_EMPLOYEE,
} from "./test-db";

const FIXTURES = [TEST_EMPLOYEE, TEST_EDITOR];

let app: FastifyInstance;
let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  app = await createTestApp(db, { sessions: sessionsFor(FIXTURES) });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await close();
});

/** The admin fixture's request. */
const asAdmin = (options: Parameters<typeof requestAs>[2]) =>
  requestAs(app, TEST_EMPLOYEE, options);

/** Where the audit history stands, so a test reads only what it wrote. */
const lastEvent = async () =>
  (
    await db.execute<{ last: number }>(
      sql`select coalesce(max(event_order), 0)::int as last from change_events`,
    )
  ).rows[0]!.last;

/** The role rows written to the audit history since `after`, oldest first. */
const roleEvents = async (after: number) =>
  (
    await db.execute(
      sql`select entity_kind, entity_id, action, snapshot->>'role' as role,
                 snapshot->>'granted_by' as granted_by, actor,
                 occurred_at is not null as dated
            from change_events
           where entity_kind in ('user_role', 'waiting_role') and event_order > ${after}
           order by event_order`,
    )
  ).rows;

/** Someone signing in, with roles waiting or listed as an admin. */
const signIn = async (
  employee: Employee,
  adminEmails: readonly string[] = [],
) => {
  await db.execute(
    sql`insert into auth_user (id, name, email, "emailVerified")
        values (${employee.id}, ${employee.name}, ${employee.email}, true)
        on conflict do nothing`,
  );
  const access = new EditorAccess(
    { findSession: async () => ok(employee) },
    new PostgresRoles(db),
    adminEmails,
  );
  return expectOk(await access.requireEmployee(new Redacted("cookie")));
};

describe("role history", () => {
  it("records a grant and a revoke once each, with the person, the role, the action, who did it and when, after its row is gone", async () => {
    const from = await lastEvent();
    const url = `/editor/employees/${TEST_EDITOR.id}/roles/approver`;

    expect((await asAdmin({ method: "PUT", url })).statusCode).toBe(204);
    // A second grant changes nothing, and adds nothing to the history.
    expect((await asAdmin({ method: "PUT", url })).statusCode).toBe(204);
    expect((await asAdmin({ method: "DELETE", url })).statusCode).toBe(204);

    const change = {
      entity_kind: "user_role",
      entity_id: TEST_EDITOR.id,
      role: "approver",
      granted_by: TEST_EMPLOYEE.id,
      actor: TEST_EMPLOYEE.id,
      dated: true,
    };
    expect(await roleEvents(from)).toEqual([
      { ...change, action: "created" },
      { ...change, action: "deleted" },
    ]);
    const { rows } = await db.execute(
      sql`select 1 from user_roles where user_id = ${TEST_EDITOR.id} and role = 'approver'`,
    );
    expect(rows).toEqual([]);
  });

  it("records a role given by email under its waiting row, not its address, and its first sign-in as that person's", async () => {
    const newcomer = {
      id: UserId.parse("newcomer"),
      email: "newcomer@govtech.bb",
      name: "Newcomer",
      roles: [],
    } satisfies Employee;
    const from = await lastEvent();
    const give = (role: string) =>
      asAdmin({
        method: "POST",
        url: "/editor/waiting-roles",
        payload: { email: newcomer.email, role },
      });

    const taken = (await give("editor")).json();
    await asAdmin({
      method: "DELETE",
      url: `/editor/waiting-roles/${taken.id}`,
    });
    const kept = (await give("approver")).json();
    expect((await signIn(newcomer)).roles).toEqual(["reader", "approver"]);

    const waiting = {
      entity_kind: "waiting_role",
      granted_by: TEST_EMPLOYEE.id,
      actor: TEST_EMPLOYEE.id,
      dated: true,
    };
    expect(await roleEvents(from)).toEqual([
      { ...waiting, entity_id: taken.id, action: "created", role: "editor" },
      { ...waiting, entity_id: taken.id, action: "deleted", role: "editor" },
      { ...waiting, entity_id: kept.id, action: "created", role: "approver" },
      // The sign-in moves it; the admin who gave it stays in the snapshot.
      {
        entity_kind: "user_role",
        entity_id: newcomer.id,
        action: "created",
        role: "approver",
        granted_by: TEST_EMPLOYEE.id,
        actor: "system",
        dated: true,
      },
    ]);
    // An entity id can't be redacted, so no address is one.
    const { rows } = await db.execute(
      sql`select 1 from change_events where entity_id like '%@%'`,
    );
    expect(rows).toEqual([]);
  });

  it("records a role given by email to someone who holds it already as taken away when they next sign in", async () => {
    const from = await lastEvent();

    const given = (
      await asAdmin({
        method: "POST",
        url: "/editor/waiting-roles",
        payload: { email: TEST_EDITOR.email, role: "editor" },
      })
    ).json();
    expect((await signIn(TEST_EDITOR)).roles).toEqual(["reader", "editor"]);

    const waiting = {
      entity_kind: "waiting_role",
      entity_id: given.id,
      role: "editor",
      granted_by: TEST_EMPLOYEE.id,
      dated: true,
    };
    expect(await roleEvents(from)).toEqual([
      { ...waiting, action: "created", actor: TEST_EMPLOYEE.id },
      { ...waiting, action: "deleted", actor: "system" },
    ]);
  });

  it("records the admin role API_V2_ADMIN_EMAILS gives, with system as its actor", async () => {
    const from = await lastEvent();

    expect((await signIn(TEST_EDITOR, [TEST_EDITOR.email])).roles).toContain(
      "admin",
    );

    expect(await roleEvents(from)).toEqual([
      {
        entity_kind: "user_role",
        entity_id: TEST_EDITOR.id,
        action: "created",
        role: "admin",
        granted_by: null,
        actor: "system",
        dated: true,
      },
    ]);
  });

  it("leaves GET /site-version as it was, which a change to a page still moves", async () => {
    const version = async () =>
      (await app.inject({ url: "/site-version" })).json().version;
    const url = `/editor/employees/${TEST_EDITOR.id}/roles/approver`;
    const before = await version();

    await asAdmin({ method: "PUT", url });
    await asAdmin({ method: "DELETE", url });
    await asAdmin({
      method: "POST",
      url: "/editor/waiting-roles",
      payload: { email: "newcomer@govtech.bb", role: "editor" },
    });

    expect(await version()).toBe(before);
    expect(
      (
        await asAdmin({
          method: "POST",
          url: "/pages",
          payload: aPage({ visibility: "draft" }),
        })
      ).statusCode,
    ).toBe(201);
    expect(await version()).not.toBe(before);
  });
});
