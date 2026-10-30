import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { CollectionRecord } from "../src/modules/collection";
import {
  AUTH_ENV,
  createEmployeeSession,
  createScratchDatabase,
  databaseQuery,
  dropScratchDatabase,
  HAS_DATABASE,
  startServer,
  type Server,
} from "./support";

const recordList = z.strictObject({
  collection: z.object({ key: z.string() }).loose(),
  records: z.array(CollectionRecord),
});

describe.skipIf(!HAS_DATABASE)("data collections over HTTP", () => {
  let server: Server;
  let database: string;
  let cookie: string;
  let userId: string;
  beforeAll(async () => {
    database = await createScratchDatabase();
    server = await startServer({ DB_NAME: database, SEED: "false" });
    ({ cookie, userId } = await createEmployeeSession(database, server.url));
    await databaseQuery(
      database,
      `insert into data_collections (key, title, record_key, schema)
       values ('offices', 'Offices', 'key', $1)`,
      [
        JSON.stringify({
          fields: [
            { key: "key", label: "Key", type: "slug" },
            { key: "name", label: "Name", type: "text" },
            { key: "email", label: "Email", type: "email" },
          ],
        }),
      ],
    );
  });
  afterAll(async () => {
    await server?.stop();
    if (database) await dropScratchDatabase(database);
  });

  const send = (method: string, path: string, body?: object, stamp?: string) =>
    fetch(server.url + path, {
      method,
      headers: {
        cookie,
        origin: AUTH_ENV.EDITOR_ORIGIN,
        ...(body ? { "content-type": "application/json" } : {}),
        ...(stamp ? { "if-updated-at": stamp } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const publicRead = async (key: string) => {
    const response = await fetch(`${server.url}/collections/${key}/records`);
    expect(response.status).toBe(200);
    return recordList.parse(await response.json()).records;
  };

  it("creates, reads, updates and deletes a record, each recorded against the employee", async () => {
    const created = await send("POST", "/collections/offices/records/north", {
      data: { name: "North office", email: "north@example.gov.bb" },
    });
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const record = CollectionRecord.parse(await created.json());
    expect(record.data).toEqual({
      key: "north",
      name: "North office",
      email: "north@example.gov.bb",
    });
    expect(await publicRead("offices")).toEqual([record]);

    const saved = await send(
      "PUT",
      "/collections/offices/records/north",
      { data: { name: "Northern office" } },
      record.updated_at,
    );
    expect(saved.status).toBe(200);
    const updated = CollectionRecord.parse(await saved.json());
    expect(updated.data).toEqual({ key: "north", name: "Northern office" });
    expect(await publicRead("offices")).toEqual([updated]);

    const stale = await send(
      "PUT",
      "/collections/offices/records/north",
      { data: { name: "Lost" } },
      record.updated_at,
    );
    expect(stale.status).toBe(409);

    const deleted = await send(
      "DELETE",
      "/collections/offices/records/north",
      undefined,
      updated.updated_at,
    );
    expect(deleted.status).toBe(204);
    expect(await publicRead("offices")).toEqual([]);

    expect(
      await databaseQuery(
        database,
        `select action, actor from change_events
          where entity_kind = 'collection_record' order by version_no`,
      ),
    ).toEqual(
      ["created", "updated", "deleted"].map((action) => ({
        action,
        actor: userId,
      })),
    );
  });

  it("refuses a field the collection does not have, naming it", async () => {
    const response = await send("POST", "/collections/offices/records/south", {
      data: { name: "South office", fax: "123" },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "validation_failed",
      errors: [{ field: "fax" }],
    });
    expect(await publicRead("offices")).toEqual([]);
  });

  it("refuses a record for a collection that does not exist", async () => {
    const response = await send("POST", "/collections/nowhere/records/x", {
      data: { name: "X" },
    });
    expect(response.status).toBe(404);
    expect(
      (await fetch(`${server.url}/collections/nowhere/records`)).status,
    ).toBe(404);
  });

  it("needs a session to write", async () => {
    const response = await fetch(
      `${server.url}/collections/offices/records/east`,
      {
        method: "POST",
        headers: {
          origin: AUTH_ENV.EDITOR_ORIGIN,
          "content-type": "application/json",
        },
        body: JSON.stringify({ data: { name: "East" } }),
      },
    );
    expect(response.status).toBe(401);
  });

  it("refuses to delete a collection that has records", async () => {
    expect(
      (
        await send("POST", "/collections/offices/records/west", {
          data: { name: "West office" },
        })
      ).status,
    ).toBe(201);
    await expect(
      databaseQuery(
        database,
        "delete from data_collections where key = 'offices'",
      ),
    ).rejects.toThrow(/collection_records_collection_key_fkey/);
  });

  it("replays its migration on a database that already ran it, keeping the records, and seeds contacts", async () => {
    await server.stop();
    await databaseQuery(
      database,
      "delete from schema_migrations where name = '014_data_collections'",
    );
    server = await startServer({ DB_NAME: database, SEED: "true" });

    expect(
      await databaseQuery(
        database,
        "select name from schema_migrations where name = '014_data_collections'",
      ),
    ).toEqual([{ name: "014_data_collections" }]);
    expect(
      (await publicRead("offices")).map((record) => record.record_key),
    ).toEqual(["west"]);
    expect(
      (await publicRead("contacts")).map((record) => record.record_key),
    ).toEqual(["barbados-drug-service", "nis-severance-payment-department"]);
  });
});
