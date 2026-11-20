import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CollectionRecord,
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

/** A collection with a field of each type #3782 adds, as a tool's records need them. */
const SHELTERS = {
  key: "shelters",
  title: "Emergency shelters",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Name", type: "text" },
      { key: "capacity", label: "Capacity", type: "number" },
      { key: "lat", label: "Latitude", type: "number" },
      { key: "has-water", label: "Has water", type: "boolean" },
      { key: "inspected", label: "Inspected", type: "date" },
      { key: "documents", label: "Documents", type: "list" },
    ],
  },
};

const ST_JUDES = {
  name: "St. Jude's Primary",
  capacity: 120,
  lat: 13.1725,
  "has-water": false,
  inspected: "2024-02-29",
  documents: ["ID card", "Proof of address"],
};

describe.skipIf(!HAS_DATABASE)(
  "number, boolean, date and list fields over HTTP (#3782)",
  () => {
    let server: Server;
    let database: string;
    let admin: EmployeeSession;
    let editor: EmployeeSession;
    beforeAll(async () => {
      database = await createScratchDatabase();
      server = await startServer({ DB_NAME: database, SEED: "false" });
      admin = await createEmployeeSession(database, server.url, {
        roles: ["admin"],
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
    const addRecord = (recordKey: string, data: object) =>
      send(editor, "POST", `/collections/shelters/records/${recordKey}`, {
        data,
      });
    const stored = () =>
      databaseQuery(
        database,
        "select record_key, data from collection_records order by record_key",
      );

    it("creates a collection with a field of each new type", async () => {
      const response = await send(admin, "POST", "/collections", SHELTERS);
      expect(response.status, await response.clone().text()).toBe(201);
      expect(CollectionView.parse(await response.json()).schema).toEqual(
        SHELTERS.schema,
      );
    });

    it("stores each value with its type, and reads it back so, signed out", async () => {
      const response = await addRecord("st-judes", ST_JUDES);
      expect(response.status).toBe(201);
      const saved = { ...ST_JUDES, key: "st-judes" };
      expect(EditorCollectionRecord.parse(await response.json()).data).toEqual(
        saved,
      );
      expect(await stored()).toEqual([{ record_key: "st-judes", data: saved }]);

      const listed = await fetch(`${server.url}/collections/shelters/records`);
      expect(listed.status).toBe(200);
      const body = (await listed.json()) as { records: unknown[] };
      expect(
        body.records.map((record) => CollectionRecord.parse(record).data),
      ).toEqual([saved]);
    });

    it("saves a changed record, its types kept", async () => {
      const detail = (await (
        await send(editor, "GET", "/collections/shelters/records/st-judes")
      ).json()) as { record: { version: number } };
      const response = await send(
        editor,
        "PUT",
        "/collections/shelters/records/st-judes",
        {
          data: {
            ...ST_JUDES,
            capacity: 0.5,
            "has-water": true,
            documents: [],
          },
          expected_version: detail.record.version,
        },
      );
      expect(response.status).toBe(200);
      expect(await stored()).toMatchObject([
        { data: { capacity: 0.5, "has-water": true, documents: [] } },
      ]);
    });

    it.each([
      ["text in a number field", { capacity: "120" }, "capacity"],
      ["text in a boolean field", { "has-water": "yes" }, "has-water"],
      ["a date that doesn't exist", { inspected: "2026-13-40" }, "inspected"],
      [
        "29 February in a common year",
        { inspected: "2026-02-29" },
        "inspected",
      ],
      [
        "a list item over the length limit",
        { documents: ["x".repeat(301)] },
        "documents",
      ],
      ["text in a list field", { documents: "ID card" }, "documents"],
    ])(
      "refuses %s with a 400 naming the field, and writes nothing",
      async (_, change, field) => {
        const before = await stored();
        const response = await addRecord("christ-church", {
          ...ST_JUDES,
          ...change,
        });
        expect(response.status).toBe(400);
        const body = (await response.json()) as {
          error: string;
          errors: { field: string; message: string }[];
        };
        expect(body.error).toBe("validation_failed");
        expect(body.errors.map((error) => error.field)).toEqual([field]);
        expect(await stored()).toEqual(before);
      },
    );
  },
);
