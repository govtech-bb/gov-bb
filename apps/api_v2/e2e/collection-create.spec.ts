import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CollectionView,
  EditorCollectionRecord,
} from "../src/modules/collection";
import {
  AUTH_ENV,
  createEmployeeSession,
  createScratchDatabase,
  databaseQuery,
  dropScratchDatabase,
  HAS_DATABASE,
  startServer,
  type EmployeeSession,
  type Server,
} from "./support";

const OFFICES = {
  key: "offices",
  title: "Offices",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Name", type: "text" },
      { key: "email", label: "Email", type: "email" },
    ],
  },
};

/** A definition with one change from OFFICES, under a key of its own. */
const breaking = (n: number, change: object) => ({
  ...OFFICES,
  key: `broken-${n}`,
  ...change,
});

describe.skipIf(!HAS_DATABASE)(
  "creating data collections over HTTP (#3681)",
  () => {
    let server: Server;
    let database: string;
    let admin: EmployeeSession;
    let approver: EmployeeSession;
    let editor: EmployeeSession;
    beforeAll(async () => {
      database = await createScratchDatabase();
      server = await startServer({ DB_NAME: database, SEED: "false" });
      admin = await createEmployeeSession(database, server.url, {
        roles: ["admin"],
      });
      approver = await createEmployeeSession(database, server.url, {
        roles: ["approver"],
      });
      editor = await createEmployeeSession(database, server.url, {
        roles: ["editor"],
      });
    });
    afterAll(async () => {
      await server?.stop();
      if (database) await dropScratchDatabase(database);
    });

    const send = (
      as: EmployeeSession,
      method: string,
      path: string,
      body?: object,
    ) =>
      fetch(server.url + path, {
        method,
        headers: {
          cookie: as.cookie,
          origin: AUTH_ENV.EDITOR_ORIGIN,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const create = (as: EmployeeSession, body: object) =>
      send(as, "POST", "/collections", body);

    /** Every collection, and every change recorded: what a refusal must leave alone. */
    const stored = async () => ({
      collections: await databaseQuery(
        database,
        "select key from data_collections order by key",
      ),
      events: await databaseQuery(
        database,
        "select count(*)::int as count from change_events",
      ),
    });

    it("refuses an employee with only the editor role, naming the roles needed, and writes nothing", async () => {
      const before = await stored();
      const response = await create(editor, OFFICES);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "forbidden",
        message: "You need the admin or approver role to do this.",
      });
      expect(await stored()).toEqual(before);
    });

    it("lets an admin create a collection, recorded against them", async () => {
      const response = await create(admin, OFFICES);
      expect(response.status).toBe(201);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(CollectionView.parse(await response.json())).toEqual({
        ...OFFICES,
        schema_version: 1,
        updated_at: expect.any(String),
      });
      expect(
        await databaseQuery(
          database,
          `select action, actor from change_events
          where entity_kind = 'data_collection' and entity_id = (
            select id::text from data_collections where key = 'offices')`,
        ),
      ).toEqual([{ action: "created", actor: admin.userId }]);
    });

    it("lets an approver create a collection, recorded against them", async () => {
      const response = await create(approver, { ...OFFICES, key: "branches" });
      expect(response.status).toBe(201);
      expect(
        await databaseQuery(
          database,
          `select action, actor from change_events
          where entity_kind = 'data_collection' and entity_id = (
            select id::text from data_collections where key = 'branches')`,
        ),
      ).toEqual([{ action: "created", actor: approver.userId }]);
    });

    it("refuses a key another collection has with a 409 naming the key, and writes nothing", async () => {
      const before = await stored();
      const response = await create(approver, { ...OFFICES, title: "Again" });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: "collection_exists",
        errors: [{ field: "key" }],
      });
      expect(await stored()).toEqual(before);
    });

    it.each([
      ["an empty field list", { schema: { fields: [] } }, "schema.fields"],
      [
        "a duplicate field key",
        {
          schema: {
            fields: [
              { key: "key", label: "Key", type: "slug" },
              { key: "key", label: "Again", type: "text" },
            ],
          },
        },
        "schema.fields.1.key",
      ],
      [
        "an unknown field type",
        {
          schema: {
            fields: [
              { key: "key", label: "Key", type: "slug" },
              { key: "opened", label: "Opened", type: "date" },
            ],
          },
        },
        "schema.fields.1.type",
      ],
      ["a record key that isn't a field", { record_key: "code" }, "record_key"],
      ["a key in the wrong format", { key: "Not A Key" }, "key"],
      [
        "a field key of __proto__",
        {
          schema: {
            fields: [
              { key: "key", label: "Key", type: "slug" },
              { key: "__proto__", label: "Odd", type: "text" },
            ],
          },
        },
        "schema.fields.1.key",
      ],
      [
        "a field key with a space",
        {
          schema: {
            fields: [
              { key: "key", label: "Key", type: "slug" },
              { key: "opening hours", label: "Hours", type: "text" },
            ],
          },
        },
        "schema.fields.1.key",
      ],
    ] as const)(
      "refuses %s, naming the field, and writes nothing",
      async (_, change, field) => {
        const before = await stored();
        const response = await create(
          admin,
          breaking(before.collections.length, change),
        );
        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({
          error: "validation_failed",
          errors: [{ field }],
        });
        expect(await stored()).toEqual(before);
      },
    );

    it("takes a record in the new collection through the existing record route", async () => {
      const response = await send(
        editor,
        "POST",
        "/collections/offices/records/north",
        {
          data: { name: "North office", email: "north@example.gov.bb" },
        },
      );
      expect(response.status).toBe(201);
      expect(EditorCollectionRecord.parse(await response.json()).data).toEqual({
        key: "north",
        name: "North office",
        email: "north@example.gov.bb",
      });
      const listed = await fetch(`${server.url}/collections/offices/records`);
      expect(listed.status).toBe(200);
    });
  },
);
