/**
 * Data collections over HTTP (#3183): editors change records, every write is
 * checked against the collection's field list and recorded against them, and
 * the site reads a collection without signing in.
 */

import type { FastifyInstance, InjectOptions } from "fastify";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PUBLIC_READ } from "./routes/responses";
import { seed } from "./seed";
import { CONTACTS } from "./seed-data/collections";
import {
  createTestApp,
  createTestDb,
  TEST_EMPLOYEE,
  TEST_HEADERS,
  type TestDb,
} from "./test-db";

let test: TestDb;
let app: FastifyInstance;

beforeEach(async () => {
  test = await createTestDb();
  await test.db.execute(
    sql`insert into data_collections (key, title, record_key, schema)
        values ('contacts', 'Contacts', 'key', ${JSON.stringify(CONTACTS.schema)}::jsonb)`,
  );
  app = await createTestApp(test.db);
});
afterEach(async () => {
  await app.close();
  await test.close();
});

const editor = (options: InjectOptions) =>
  app.inject({ ...options, headers: { ...TEST_HEADERS, ...options.headers } });
const recordUrl = (recordKey: string, collection = "contacts") =>
  `/collections/${collection}/records/${recordKey}`;
const create = (recordKey: string, data: object, collection = "contacts") =>
  editor({
    method: "POST",
    url: recordUrl(recordKey, collection),
    payload: { data },
  });
const read = (collection = "contacts") =>
  app.inject({ url: `/collections/${collection}/records` });

const DRUG_SERVICE = {
  name: "Barbados Drug Service",
  phone: "(246) 535-4300",
  email: "management@drugservice.gov.bb",
};

describe("record writes", () => {
  it("creates, reads, updates and deletes a record", async () => {
    const created = await create("drug-service", DRUG_SERVICE);
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toEqual({
      record_key: "drug-service",
      data: { ...DRUG_SERVICE, key: "drug-service" },
      updated_at: expect.any(String),
    });

    const listed = await read();
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({
      collection: {
        key: "contacts",
        title: "Contacts",
        record_key: "key",
        schema: CONTACTS.schema,
        schema_version: 1,
        updated_at: expect.any(String),
      },
      records: [created.json()],
    });

    const saved = await editor({
      method: "PUT",
      url: recordUrl("drug-service"),
      headers: { "if-updated-at": created.json().updated_at },
      payload: { data: { name: "Drug Service" } },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().data).toEqual({
      name: "Drug Service",
      key: "drug-service",
    });
    expect(saved.json().updated_at).not.toBe(created.json().updated_at);

    const deleted = await editor({
      method: "DELETE",
      url: recordUrl("drug-service"),
      headers: { "if-updated-at": saved.json().updated_at },
    });
    expect(deleted.statusCode).toBe(204);
    expect((await read()).json().records).toEqual([]);
  });

  it("refuses a field the collection does not have, naming it", async () => {
    const response = await create("drug-service", {
      ...DRUG_SERVICE,
      fax: "1",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "validation_failed",
      message: expect.stringContaining("fax"),
      errors: [{ field: "fax", message: "fax is not a field of contacts." }],
    });
    expect((await read()).json().records).toEqual([]);
  });

  it("refuses a value of the wrong kind", async () => {
    const response = await create("drug-service", {
      name: 42,
      email: "not an email",
    });
    expect(response.statusCode).toBe(400);
    expect(
      response.json().errors.map((error: { field: string }) => error.field),
    ).toEqual(["name", "email"]);
  });

  it("refuses a record key field that is not the url's", async () => {
    const response = await create("drug-service", { key: "other" });
    expect(response.statusCode).toBe(400);
    expect(response.json().errors).toEqual([
      { field: "key", message: expect.stringContaining("drug-service") },
    ]);
  });

  it("refuses a record for a collection that does not exist", async () => {
    const response = await create("drug-service", DRUG_SERVICE, "nowhere");
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "not_found",
      message: "No collection nowhere.",
    });
  });

  it("refuses to create a record that is already there", async () => {
    await create("drug-service", DRUG_SERVICE);
    const again = await create("drug-service", DRUG_SERVICE);
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("record_exists");
  });

  it("refuses to save or delete a record that is not there", async () => {
    const saved = await editor({
      method: "PUT",
      url: recordUrl("missing"),
      payload: { data: {} },
    });
    const deleted = await editor({
      method: "DELETE",
      url: recordUrl("missing"),
    });
    expect([saved.statusCode, deleted.statusCode]).toEqual([404, 404]);
  });

  it("refuses a write over a version the caller did not read", async () => {
    const created = (await create("drug-service", DRUG_SERVICE)).json();
    const first = await editor({
      method: "PUT",
      url: recordUrl("drug-service"),
      headers: { "if-updated-at": created.updated_at },
      payload: { data: { name: "First" } },
    });
    expect(first.statusCode).toBe(200);

    const stale = { "if-updated-at": created.updated_at };
    const second = await editor({
      method: "PUT",
      url: recordUrl("drug-service"),
      headers: stale,
      payload: { data: { name: "Second" } },
    });
    const deleted = await editor({
      method: "DELETE",
      url: recordUrl("drug-service"),
      headers: stale,
    });
    expect([second.statusCode, deleted.statusCode]).toEqual([409, 409]);
    expect(second.json().error).toBe("conflict");
    expect((await read()).json().records[0].data.name).toBe("First");
  });

  it("records each write in the history against the employee", async () => {
    const created = (await create("drug-service", DRUG_SERVICE)).json();
    await editor({
      method: "PUT",
      url: recordUrl("drug-service"),
      headers: { "if-updated-at": created.updated_at },
      payload: { data: { name: "Drug Service" } },
    });
    await editor({ method: "DELETE", url: recordUrl("drug-service") });

    const { rows } = await test.db.execute<{
      action: string;
      actor: string;
      record_key: string;
    }>(
      sql`select action, actor, snapshot->>'record_key' as record_key
            from change_events where entity_kind = 'collection_record'
            order by version_no`,
    );
    expect(rows).toEqual(
      ["created", "updated", "deleted"].map((action) => ({
        action,
        actor: TEST_EMPLOYEE.id,
        record_key: "drug-service",
      })),
    );
  });
});

describe("the collection list", () => {
  it("lists each collection with its record count, signed in", async () => {
    await create("drug-service", DRUG_SERVICE);
    const response = await editor({ url: "/collections" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      collections: [
        expect.objectContaining({ key: "contacts", record_count: 1 }),
      ],
    });
    expect((await app.inject({ url: "/collections" })).statusCode).toBe(401);
  });
});

describe("the public read", () => {
  it("serves a collection signed out, with the cache headers of a page", async () => {
    const response = await read();
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe(PUBLIC_READ);
    expect(response.headers.etag).toBeDefined();
  });

  it("is a 404 for a collection that does not exist", async () => {
    const response = await read("nowhere");
    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("public, max-age=10");
  });
});

describe("the database", () => {
  it("will not delete a collection that has records", async () => {
    await create("drug-service", DRUG_SERVICE);
    const refused = await test.db
      .execute(sql`delete from data_collections where key = 'contacts'`)
      .then(
        () => null,
        (error: Error) => String(error.cause),
      );
    expect(refused).toMatch(/collection_records_collection_key_fkey/);
  });

  it("will not hold a record for a collection that does not exist", async () => {
    const refused = await test.db
      .execute(
        sql`insert into collection_records (collection_key, record_key, data)
            values ('nowhere', 'x', '{}')`,
      )
      .then(
        () => null,
        (error: Error) => String(error.cause),
      );
    expect(refused).toMatch(/collection_records_collection_key_fkey/);
  });
});

describe("the seeded contacts", () => {
  it("fit their own field list", async () => {
    await test.db.execute(sql`delete from data_collections`);
    await seed(test.db);
    const response = await read();
    expect(response.statusCode).toBe(200);
    expect(response.json().collection).toMatchObject({
      key: "contacts",
      record_key: "key",
      schema: CONTACTS.schema,
    });
    for (const record of response.json().records) {
      const saved = await editor({
        method: "PUT",
        url: recordUrl(record.record_key),
        payload: { data: record.data },
      });
      expect(saved.statusCode, saved.body).toBe(200);
    }
    expect(
      response
        .json()
        .records.map((record: { record_key: string }) => record.record_key),
    ).toEqual(["barbados-drug-service", "nis-severance-payment-department"]);
  }, 60_000);
});
