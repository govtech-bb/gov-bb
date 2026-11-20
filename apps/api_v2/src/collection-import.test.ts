/**
 * import-collections (#3783) against real Postgres: a database whose estate
 * is already imported gets the seed's missing collections and records, and
 * nothing else. Fixture seed collections, so the tests hold whatever
 * collections the real seed has.
 */

import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  compareCollection,
  describeDifference,
  FieldListRefused,
  importCollections,
  parseSeedCollection,
} from "./collection-import";
import type { Database } from "./db";
import { seed } from "./seed";
import { ESTATE } from "./seed-data";
import { COLLECTIONS, type SeedCollection } from "./seed-data/collections";
import {
  createTestApp,
  createTestDb,
  createTestServices,
  expectOk,
  TEST_EMPLOYEE,
  type TestDb,
} from "./test-db";

/** A collection the database already has, missing one seed record. */
const OFFICES: SeedCollection = {
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
  records: [
    { key: "north", name: "North office", email: "north@gov.bb" },
    { key: "south", name: "South office" },
  ],
};

/** A collection the database does not have yet. */
const PARISHES: SeedCollection = {
  key: "parishes",
  title: "Parishes",
  record_key: "key",
  schema: {
    fields: [
      { key: "key", label: "Key", type: "slug" },
      { key: "name", label: "Name", type: "text" },
    ],
  },
  records: [
    { key: "st-james", name: "St. James" },
    { key: "st-lucy", name: "St. Lucy" },
  ],
};

const FIXTURE = [OFFICES, PARISHES];

let test: TestDb;
let db: Database;
const apps: FastifyInstance[] = [];

/**
 * An imported estate (a slice of it, for speed), with `offices` and its
 * first record already there, as an earlier seed would have left them.
 */
beforeEach(async () => {
  test = await createTestDb();
  db = test.db;
  await seed(db, {
    categories: ESTATE.categories,
    pages: ESTATE.pages.filter((page) => page.parent === null).slice(0, 10),
  });
  await db.execute(
    sql`insert into data_collections (key, title, record_key, schema)
        values ('offices', 'Offices', 'key', ${JSON.stringify(OFFICES.schema)}::jsonb)`,
  );
  await db.execute(
    sql`insert into collection_records (collection_key, record_key, data)
        values ('offices', 'north', ${JSON.stringify(OFFICES.records[0])}::jsonb)`,
  );
}, 60_000);
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  await test.close();
});

/** Every row of the tables the import must never touch, as text. */
const untouched = async () =>
  JSON.stringify(
    (
      await db.execute(
        sql`select ${sql.raw(
          [
            "content_pages",
            "categories",
            "page_redirects",
            "page_revisions",
            "search_chunks",
          ]
            .map(
              (table) =>
                `(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from ${table} t) as ${table}`,
            )
            .join(", "),
        )}`,
      )
    ).rows[0],
  );

/** Every collection and record, and how many history rows there are. */
const written = async () =>
  (
    await db.execute(
      sql`select
            (select jsonb_agg(to_jsonb(c) order by c.key) from data_collections c) as collections,
            (select jsonb_agg(to_jsonb(r) order by r.collection_key, r.record_key) from collection_records r) as records,
            (select count(*)::int from change_events) as events`,
    )
  ).rows[0];

const lastEvent = async () =>
  Number(
    (
      await db.execute<{ n: string | null }>(
        sql`select max(event_order) as n from change_events`,
      )
    ).rows[0]!.n ?? 0,
  );

/** The history written after `since`, oldest first. */
const eventsAfter = async (since: number) =>
  (
    await db.execute<{
      entity_kind: string;
      action: string;
      actor: string;
      name: string;
    }>(
      sql`select entity_kind, action, actor,
                 coalesce(snapshot->>'collection_key' || '/' || (snapshot->>'record_key'), snapshot->>'key') as name
          from change_events where event_order > ${since} order by event_order`,
    )
  ).rows;

/** An editor changes a record through the service, as the editor's save does. */
async function editorChanges(collection: string, record: string, data: object) {
  apps.push(await createTestApp(db)); // registers TEST_EMPLOYEE
  const { collections } = createTestServices(db);
  const current = expectOk(await collections.detail(collection, record));
  expectOk(
    await collections.save(
      collection,
      record,
      data as Record<string, unknown>,
      current!.record.version,
      TEST_EMPLOYEE,
    ),
  );
}

/** The collections as the public read serves them, compared with the fixture. */
async function check(): Promise<string[]> {
  const app = await createTestApp(db);
  apps.push(app);
  const lines: string[] = [];
  for (const seed of FIXTURE.map(parseSeedCollection)) {
    const response = await app.inject({
      method: "GET",
      url: `/collections/${seed.definition.key}/records`,
    });
    const stored = response.statusCode === 404 ? null : response.json();
    lines.push(...compareCollection(seed, stored).map(describeDifference));
  }
  return lines;
}

describe("import-collections", () => {
  it("creates a missing collection and adds missing records, by system, leaving every page as it was", async () => {
    const pages = await untouched();
    const since = await lastEvent();

    const report = await importCollections(db, {
      dryRun: false,
      collections: FIXTURE,
    });

    expect(report).toEqual({
      reason: null,
      collections_created: 1,
      created: ["parishes"],
      records_added: 3,
      added: ["offices/south", "parishes/st-james", "parishes/st-lucy"],
      records_skipped: 0,
      skipped: [],
      records_replaced: 0,
      replaced: [],
    });
    expect(await untouched()).toBe(pages);
    expect(await eventsAfter(since)).toEqual([
      {
        entity_kind: "collection_record",
        action: "created",
        actor: "system",
        name: "offices/south",
      },
      {
        entity_kind: "data_collection",
        action: "created",
        actor: "system",
        name: "parishes",
      },
      ...["st-james", "st-lucy"].map((record) => ({
        entity_kind: "collection_record",
        action: "created",
        actor: "system",
        name: `parishes/${record}`,
      })),
    ]);
    const { collections } = createTestServices(db);
    const parishes = expectOk(await collections.read("parishes"))!;
    expect(parishes.collection).toMatchObject({
      key: "parishes",
      title: "Parishes",
      record_key: "key",
      schema: PARISHES.schema,
    });
    expect(parishes.records.map((record) => record.data)).toEqual(
      PARISHES.records,
    );
    expect(
      expectOk(await collections.read("offices"))!.records.map((r) => r.data),
    ).toEqual(OFFICES.records);
  });

  it("writes nothing on a second run", async () => {
    await importCollections(db, { dryRun: false, collections: FIXTURE });
    const before = await written();

    const again = await importCollections(db, {
      dryRun: false,
      collections: FIXTURE,
    });

    expect(again).toMatchObject({
      collections_created: 0,
      records_added: 0,
      records_skipped: 0,
      records_replaced: 0,
    });
    expect(await written()).toEqual(before);
  });

  it("skips and names a record an editor changed, and --force replaces it by system", async () => {
    await importCollections(db, { dryRun: false, collections: FIXTURE });
    await editorChanges("offices", "north", {
      name: "North office (moved)",
      email: "north@gov.bb",
    });
    const before = await written();

    const kept = await importCollections(db, {
      dryRun: false,
      collections: FIXTURE,
    });
    expect(kept).toMatchObject({
      reason: null,
      records_added: 0,
      records_skipped: 1,
      skipped: ["offices/north"],
      records_replaced: 0,
    });
    expect(await written()).toEqual(before);

    const since = await lastEvent();
    const replaced = await importCollections(db, {
      dryRun: false,
      force: "restore the seed's North office",
      collections: FIXTURE,
    });
    expect(replaced).toEqual({
      reason: "restore the seed's North office",
      collections_created: 0,
      created: [],
      records_added: 0,
      added: [],
      records_skipped: 0,
      skipped: [],
      records_replaced: 1,
      replaced: ["offices/north"],
    });
    expect(await eventsAfter(since)).toEqual([
      {
        entity_kind: "collection_record",
        action: "updated",
        actor: "system",
        name: "offices/north",
      },
    ]);
    const { collections } = createTestServices(db);
    expect(
      expectOk(await collections.detail("offices", "north"))!.record.data,
    ).toEqual(OFFICES.records[0]);
  });

  it("refuses a seed field list that differs from the stored one, naming it, and writes nothing", async () => {
    const before = await written();
    const pages = await untouched();
    const changed: SeedCollection = {
      ...OFFICES,
      schema: {
        fields: [
          ...OFFICES.schema.fields,
          { key: "phone", label: "Telephone", type: "text" },
        ],
      },
    };

    const refusal = importCollections(db, {
      dryRun: false,
      // PARISHES is missing, so a run that wrote anything would create it.
      collections: [PARISHES, changed],
    });

    await expect(refusal).rejects.toBeInstanceOf(FieldListRefused);
    await expect(refusal).rejects.toThrow(
      /offices: field list differs\. stored: .*email \(email, "Email"\)\. seed: .*phone \(text, "Telephone"\)/,
    );
    expect(await written()).toEqual(before);
    expect(await untouched()).toBe(pages);
  });

  it("dry run reports the same counts as the real run and writes nothing", async () => {
    await importCollections(db, { dryRun: false, collections: [OFFICES] });
    await editorChanges("offices", "south", { name: "South office (moved)" });
    const before = await written();

    const dry = await importCollections(db, {
      dryRun: true,
      force: "rehearsal",
      collections: FIXTURE,
    });
    expect(await written()).toEqual(before);

    const real = await importCollections(db, {
      dryRun: false,
      force: "rehearsal",
      collections: FIXTURE,
    });
    expect(dry).toEqual(real);
    expect(real).toMatchObject({
      collections_created: 1,
      records_added: 2,
      records_replaced: 1,
    });
  });

  it("refuses a seed record its field list rejects, before writing", async () => {
    const before = await written();
    const refusal = importCollections(db, {
      dryRun: false,
      collections: [
        PARISHES,
        { ...OFFICES, records: [{ key: "east", email: "not an email" }] },
      ],
    });
    await expect(refusal).rejects.toThrow(
      "seed collection offices, record east: Enter an email address.",
    );
    expect(await written()).toEqual(before);
  });
});

describe("check-collections' comparison", () => {
  it("finds no difference after a run, and names each record that differs", async () => {
    expect(await check()).toEqual([
      "offices/south: record missing",
      "parishes: collection missing",
      "parishes/st-james: record missing",
      "parishes/st-lucy: record missing",
    ]);

    await importCollections(db, { dryRun: false, collections: FIXTURE });
    expect(await check()).toEqual([]);

    await editorChanges("parishes", "st-lucy", { name: "Saint Lucy" });
    expect(await check()).toEqual([
      "parishes/st-lucy: record differs from the seed",
    ]);
  });

  it("names a field list that differs", async () => {
    await db.execute(
      sql`update data_collections set schema = jsonb_set(schema, '{fields,1,label}', '"Office"') where key = 'offices'`,
    );
    expect(await check()).toEqual([
      'offices: field list differs. stored: record_key key; fields key (slug, "Key"), name (text, "Office"), email (email, "Email"). seed: record_key key; fields key (slug, "Key"), name (text, "Name"), email (email, "Email").',
      "parishes: collection missing",
      "parishes/st-james: record missing",
      "parishes/st-lucy: record missing",
    ]);
  });
});

describe("the real seed", () => {
  it("passes every rule, and an import into a seeded database writes nothing", async () => {
    for (const collection of COLLECTIONS) parseSeedCollection(collection);
    // beforeEach's seed() created the real collections with their records.
    const before = await written();
    expect(await importCollections(db, { dryRun: false })).toMatchObject({
      collections_created: 0,
      records_added: 0,
      records_skipped: 0,
    });
    expect(await written()).toEqual(before);
  });

  it("creates every seed collection in a database imported before them", async () => {
    await db.execute(sql`delete from collection_records`);
    await db.execute(sql`delete from data_collections where key <> 'offices'`);
    const report = await importCollections(db, { dryRun: false });
    expect(report.collections_created).toBe(COLLECTIONS.length);
    expect(report.records_added).toBe(
      COLLECTIONS.reduce((n, c) => n + c.records.length, 0),
    );
  });
});
