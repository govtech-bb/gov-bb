/**
 * API_V2_EMAIL_MOVES (#3418): a GitHub-era user moves to their Workspace
 * address and keeps their id, so their roles and history stay theirs.
 */

import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { moveEmails } from "./adapters/postgres-email-moves";
import type { Database } from "./db";
import { createTestDb } from "./test-db";

const MOVE = { from: "member@gmail.com", to: "member@govtech.bb" };

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.execute(sql`
    insert into auth_user (id, name, email, "emailVerified") values
      ('old-user', 'Member', 'Member@Gmail.com', true);
    insert into user_roles (user_id, role) values ('old-user', 'approver');
    insert into change_events (entity_kind, entity_id, version_no, action, snapshot, actor)
      values ('content_page', 'x', 1, 'created', '{}', 'old-user');`);
});

afterEach(async () => {
  await close();
});

const users = async () =>
  (
    await db.execute(
      sql`select id, email from auth_user where id in ('old-user', 'new-user') order by id`,
    )
  ).rows;

describe("moveEmails", () => {
  it("moves the user to their Workspace address, keeping id, roles and history, and a replay changes nothing", async () => {
    expect(await moveEmails(db, [MOVE])).toEqual(["moved"]);
    const after = await users();
    expect(after).toEqual([{ id: "old-user", email: "member@govtech.bb" }]);
    expect(
      (await db.execute(sql`select user_id, role from user_roles`)).rows,
    ).toEqual([{ user_id: "old-user", role: "approver" }]);
    expect(
      (
        await db.execute(
          sql`select actor from change_events where entity_id = 'x'`,
        )
      ).rows,
    ).toEqual([{ actor: "old-user" }]);

    expect(await moveEmails(db, [MOVE])).toEqual(["done"]);
    expect(await users()).toEqual(after);
  });

  it("drops a Workspace user made by an earlier Google sign-in when it has no history", async () => {
    await db.execute(sql`
      insert into auth_user (id, name, email, "emailVerified") values
        ('new-user', 'Member', 'member@govtech.bb', true);
      insert into auth_account (id, "accountId", "providerId", "userId", "updatedAt") values
        ('google-account', 'google-id', 'google', 'new-user', now());
      insert into user_roles (user_id, role) values ('new-user', 'editor');
      insert into user_roles (user_id, role, granted_by) values ('old-user', 'editor', 'new-user');`);
    expect(await moveEmails(db, [MOVE])).toEqual(["moved"]);
    // Its grants no longer name a user that is gone.
    expect(
      (
        await db.execute(
          sql`select role, granted_by from user_roles where user_id = 'old-user' order by role`,
        )
      ).rows,
    ).toEqual([
      { role: "approver", granted_by: null },
      { role: "editor", granted_by: null },
    ]);
    expect(await users()).toEqual([
      { id: "old-user", email: "member@govtech.bb" },
    ]);
    // The next Google sign-in links a fresh account to the moved user.
    expect((await db.execute(sql`select id from auth_account`)).rows).toEqual(
      [],
    );
  });

  it("leaves both users alone when the Workspace user already has history", async () => {
    await db.execute(sql`
      insert into auth_user (id, name, email, "emailVerified") values
        ('new-user', 'Member', 'member@govtech.bb', true);
      insert into change_events (entity_kind, entity_id, version_no, action, snapshot, actor)
        values ('content_page', 'y', 1, 'created', '{}', 'new-user');`);
    const before = await users();
    expect(await moveEmails(db, [MOVE])).toEqual(["conflict"]);
    expect(await users()).toEqual(before);
  });

  it("reports a move whose user exists under neither address", async () => {
    expect(
      await moveEmails(db, [{ from: "gone@gmail.com", to: "gone@govtech.bb" }]),
    ).toEqual(["missing"]);
  });
});
