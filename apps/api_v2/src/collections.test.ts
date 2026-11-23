/**
 * Data collections over HTTP (#3183): editors change records, every write is
 * checked against the collection's field list and recorded against them, and
 * the site reads a collection without signing in.
 */

import type { FastifyInstance, InjectOptions } from "fastify";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresCollections } from "./adapters/postgres-collections";
import type { RecordPage } from "./modules/collection";
import { PageId, type SitePageSummary } from "./modules/page";
import { ok } from "./modules/result";
import { CollectionEditing } from "./services/collection-editing";
import { PUBLIC_READ } from "./routes/responses";
import { seed } from "./seed";
import { CONTACTS } from "./seed-data/collections";
import {
  createTestApp,
  createTestDb,
  expectOk,
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
      version: expect.any(Number),
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
      records: [
        {
          record_key: created.json().record_key,
          data: created.json().data,
          updated_at: created.json().updated_at,
        },
      ],
    });

    const saved = await editor({
      method: "PUT",
      url: recordUrl("drug-service"),
      payload: {
        data: { name: "Drug Service" },
        expected_version: created.json().version,
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().record.data).toEqual({
      name: "Drug Service",
      key: "drug-service",
    });
    expect(saved.json().record.updated_at).not.toBe(created.json().updated_at);

    const deleted = await editor({
      method: "DELETE",
      url: `${recordUrl("drug-service")}?expected_version=${saved.json().record.version}`,
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
      payload: {
        data: {},
        expected_version: 1,
      },
    });
    const deleted = await editor({
      method: "DELETE",
      url: `${recordUrl("missing")}?expected_version=1`,
    });
    expect([saved.statusCode, deleted.statusCode]).toEqual([404, 404]);
  });

  it("refuses a write over a version the caller did not read", async () => {
    const created = (await create("drug-service", DRUG_SERVICE)).json();
    const first = await editor({
      method: "PUT",
      url: recordUrl("drug-service"),
      payload: {
        data: { name: "First" },
        expected_version: created.version,
      },
    });
    expect(first.statusCode).toBe(200);

    const second = await editor({
      method: "PUT",
      url: recordUrl("drug-service"),
      payload: {
        data: { name: "Second" },
        expected_version: created.version,
      },
    });
    const deleted = await editor({
      method: "DELETE",
      url: `${recordUrl("drug-service")}?expected_version=${created.version}`,
    });
    expect([second.statusCode, deleted.statusCode]).toEqual([409, 409]);
    expect(second.json().error).toBe("version_conflict");
    expect((await read()).json().records[0].data.name).toBe("First");
  });

  it("records each write in the history against the employee", async () => {
    const created = (await create("drug-service", DRUG_SERVICE)).json();
    const saved = await editor({
      method: "PUT",
      url: recordUrl("drug-service"),
      payload: {
        data: { name: "Drug Service" },
        expected_version: created.version,
      },
    });
    await editor({
      method: "DELETE",
      url: `${recordUrl("drug-service")}?expected_version=${saved.json().record.version}`,
    });

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

describe("number, boolean, date and list fields (#3782)", () => {
  const SHELTER = {
    capacity: 120,
    lat: 13.1,
    "has-water": true,
    opened: "2026-08-01",
    documents: ["ID card", "Proof of address"],
  };
  beforeEach(async () => {
    await test.db.execute(
      sql`insert into data_collections (key, title, record_key, schema)
          values ('shelters', 'Shelters', 'key', ${JSON.stringify({
            fields: [
              { key: "key", label: "Key", type: "slug" },
              { key: "capacity", label: "Capacity", type: "number" },
              { key: "lat", label: "Latitude", type: "number" },
              { key: "has-water", label: "Has water", type: "boolean" },
              { key: "opened", label: "Opened", type: "date" },
              { key: "documents", label: "Documents", type: "list" },
            ],
          })}::jsonb)`,
    );
  });

  it("stores each value with its type and reads it back so", async () => {
    const created = await create("st-judes", SHELTER, "shelters");
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().data).toEqual({ ...SHELTER, key: "st-judes" });
    expect((await read("shelters")).json().records[0].data).toEqual({
      ...SHELTER,
      key: "st-judes",
    });
    const [row] = (
      await test.db.execute(
        sql`select jsonb_typeof(data->'capacity') as capacity,
                   jsonb_typeof(data->'has-water') as water,
                   jsonb_typeof(data->'documents') as documents
              from collection_records where record_key = 'st-judes'`,
      )
    ).rows;
    expect(row).toEqual({
      capacity: "number",
      water: "boolean",
      documents: "array",
    });
  });

  it("refuses a wrong value, naming its field, and writes nothing", async () => {
    const response = await create(
      "st-judes",
      {
        capacity: "120",
        "has-water": "yes",
        opened: "2026-13-40",
        documents: ["x".repeat(301)],
      },
      "shelters",
    );
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("validation_failed");
    expect(
      response.json().errors.map((error: { field: string }) => error.field),
    ).toEqual(["capacity", "has-water", "opened", "documents"]);
    expect((await read("shelters")).json().records).toEqual([]);
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
      const detail = (
        await editor({ url: recordUrl(record.record_key) })
      ).json();
      const saved = await editor({
        method: "PUT",
        url: recordUrl(record.record_key),
        payload: {
          data: record.data,
          expected_version: detail.record.version,
        },
      });
      expect(saved.statusCode, saved.body).toBe(200);
    }
    expect(
      response
        .json()
        .records.map((record: { record_key: string }) => record.record_key),
    ).toEqual([
      "barbados-drug-service",
      "barbados-met-office",
      "bwa-water-outages",
      "dem-emergency-line",
      "nis-severance-payment-department",
      "police-emergency",
    ]);
  }, 60_000);
});

describe("the pages that show a record", () => {
  const SERVICE = "11111111-1111-4111-8111-111111111111";
  const FACT = "22222222-2222-4222-8222-222222222222";
  const CONTACT = "33333333-3333-4333-8333-333333333333";
  const DRAFTED = "44444444-4444-4444-8444-444444444444";
  const DISCARDED = "55555555-5555-4555-8555-555555555555";
  const ELSEWHERE = "66666666-6666-4666-8666-666666666666";
  const CATEGORY = "77777777-7777-4777-8777-777777777777";

  const page = (
    id: string,
    slug: string,
    title: string,
    body: string,
    parent: string | null = SERVICE,
  ) =>
    test.db.execute(
      sql`insert into content_pages (id, url, slug, category_id, parent_id, title, body_markdown)
          values (${id}, ${`/drug-licence${parent ? `/${slug}` : ""}`}, ${slug},
                  ${CATEGORY}, ${parent}, ${title}, ${body})`,
    );
  const revision = (id: string, status: string, body: string) =>
    test.db.execute(
      sql`insert into page_revisions (page_id, status, fields, live_updated_at, created_by, contributors)
          values (${id}, ${status}, ${JSON.stringify({ body_markdown: body })}::jsonb,
                  now(), ${TEST_EMPLOYEE.id}, array[${TEST_EMPLOYEE.id}])`,
    );
  const fact = (record: string, collection = "contacts") =>
    `Call :fact{collection="${collection}" record="${record}" field="phone"}.`;

  it.each(["draft", "submitted"])(
    "lists live references and those in a %s revision under their service",
    async (status) => {
      await test.db.execute(
        sql`insert into categories (id, slug, title) values (${CATEGORY}, 'health', 'Health')`,
      );
      await page(SERVICE, "drug-licence", "Get a drug licence", "Apply.", null);
      await page(DRAFTED, "fees", "Fees", "No contact yet.");
      await revision(DRAFTED, status, `Fees. ${fact("drug-service")}`);
      await page(
        CONTACT,
        "contact",
        "Contact the service",
        '::contact{collection="contacts" record="drug-service" fields="phone"}',
      );
      await page(FACT, "call-us", "Call us", fact("drug-service"));
      await page(DISCARDED, "forms", "Forms", "No contact.");
      await revision(DISCARDED, "discarded", fact("drug-service"));
      // Mentions, but not of this record: another record, and another collection's
      await page(
        ELSEWHERE,
        "elsewhere",
        "Elsewhere",
        `${fact("drug-services")} ${fact("drug-service", "offices")}`,
      );
      await revision(ELSEWHERE, "rejected", fact("drug-service"));

      const response = await editor({
        url: "/collections/contacts/records/drug-service/pages",
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual({
        pages: [
          {
            id: FACT,
            title: "Call us",
            url: "/drug-licence/call-us",
            visibility: "draft",
            service_id: SERVICE,
          },
          {
            id: CONTACT,
            title: "Contact the service",
            url: "/drug-licence/contact",
            visibility: "draft",
            service_id: SERVICE,
          },
          {
            id: DRAFTED,
            title: "Fees",
            url: "/drug-licence/fees",
            visibility: "draft",
            service_id: SERVICE,
          },
        ],
      });
    },
  );

  it("distinguishes a seeded service from a site page that opens by its own id", async () => {
    await test.db.execute(sql`delete from data_collections`);
    await seed(test.db);
    const sites = await editor({ url: "/editor/site-pages" });
    const terms = sites
      .json<{ pages: SitePageSummary[] }>()
      .pages.find((page) => page.url === "/terms-conditions");
    if (!terms) throw new Error("Missing Terms and conditions site page");
    await revision(terms.id, "draft", fact("dem-emergency-line"));

    const response = await editor({
      url: `${recordUrl("dem-emergency-line")}/pages`,
    });
    expect(response.statusCode, response.body).toBe(200);
    const { pages } = response.json<{ pages: RecordPage[] }>();
    expect(pages).toContainEqual({ ...terms, service_id: null });
    const stormReady = pages.find(
      (page) => page.url === "/health-and-emergency-services/stormready",
    );
    if (!stormReady) throw new Error("Missing StormReady contact block");
    expect(stormReady.service_id).toBe(stormReady.id);
    expect(
      (await editor({ url: `/services/${stormReady.service_id}` })).statusCode,
    ).toBe(200);
  });

  it("rejects an invalid record key", async () => {
    expect(
      (await editor({ url: `${recordUrl("Not-a-slug")}/pages` })).statusCode,
    ).toBe(400);
  });

  it("sorts Used on by title even when storage returns the last title first", async () => {
    const store = new PostgresCollections(test.db);
    const candidate = (id: string, title: string) => ({
      id: PageId.parse(id),
      service_id: PageId.parse(SERVICE),
      title,
      url: `/${title.toLowerCase()}`,
      visibility: "public" as const,
      bodies: [fact("drug-service")],
    });
    vi.spyOn(store, "pagesMentioning").mockResolvedValue(
      ok([candidate(FACT, "Zeta"), candidate(CONTACT, "Alpha")]),
    );

    const pages = expectOk(
      await new CollectionEditing(store).pages("contacts", "drug-service"),
    );
    expect(pages.map((page) => page.title)).toEqual(["Alpha", "Zeta"]);
  });

  it("is for signed-in editors only", async () => {
    const response = await app.inject({
      url: "/collections/contacts/records/drug-service/pages",
    });
    expect(response.statusCode).toBe(401);
  });
});
