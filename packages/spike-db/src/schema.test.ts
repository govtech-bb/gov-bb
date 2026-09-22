import type { PGliteInterface } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createMemoryDb } from "./client";
import { migrate } from "./migrate";
import { seed } from "./seed";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createMemoryDb();
});

const count = async (table: string) => {
  const result = await db.query<{ n: string }>(
    `select count(*)::text as n from ${table}`,
  );
  return Number(result.rows[0].n);
};

describe("migrate and seed", () => {
  it("loads the collections, the records and the documents", async () => {
    expect(await count("data_collections")).toBe(3);
    expect(await count("content_pages")).toBe(4);

    const pharmacies = await db.query<{ n: string }>(
      `select count(*)::text as n from collection_records
        where collection_key = 'pharmacies'`,
    );
    expect(Number(pharmacies.rows[0].n)).toBe(163);
  });

  it("is idempotent — a second load duplicates nothing", async () => {
    const before = await count("content_pages");
    expect(await migrate(db)).toEqual([]);
    expect(await seed(db)).toBe(false);
    expect(await count("content_pages")).toBe(before);
    expect(await count("collection_records")).toBe(163 + 12 + 12);
  });

  it("enforces the url unique constraint", async () => {
    await expect(
      db.query(
        `insert into content_pages (url, slug, schema_name, document_type, title, body)
         values ('/bank-holiday-calendar', 'x', 'guide', 'x', 'x',
                 '{"version":1,"blocks":[],"refs":{}}'::jsonb)`,
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });
});

describe("finding 4 — the append-only trigger", () => {
  beforeAll(async () => {
    await db.query(
      `insert into change_events (entity_kind, entity_id, version_no, action, snapshot)
       values ('content_page', 'seed-doc', 1, 'created', '{}'::jsonb)`,
    );
  });

  it("raises on UPDATE", async () => {
    await expect(
      db.query(`update change_events set action = 'updated'`),
    ).rejects.toThrow(/append-only/);
  });

  it("raises on DELETE", async () => {
    await expect(db.query(`delete from change_events`)).rejects.toThrow(
      /append-only/,
    );
  });

  it("still accepts INSERT", async () => {
    await db.query(
      `insert into change_events (entity_kind, entity_id, version_no, action, snapshot)
       values ('content_page', 'seed-doc', 2, 'updated', '{}'::jsonb)`,
    );
    expect(await count("change_events")).toBe(2);
  });

  it("rejects a duplicate version for the same entity", async () => {
    await expect(
      db.query(
        `insert into change_events (entity_kind, entity_id, version_no, action, snapshot)
         values ('content_page', 'seed-doc', 2, 'updated', '{}'::jsonb)`,
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });
});

describe("finding 2 — how much weight the body CHECK carries", () => {
  const insert = (body: string) =>
    db.query(
      `insert into content_pages (url, slug, schema_name, document_type, title, body)
       values ($1, 'x', 'guide', 'x', 'x', $2::jsonb)`,
      [`/check-${Math.random().toString(36).slice(2)}`, body],
    );

  it("rejects a body missing any of the three top-level keys", async () => {
    await expect(insert('{"blocks":[],"refs":{}}')).rejects.toThrow(
      /content_pages_body_shape/,
    );
    await expect(insert('{"version":1,"refs":{}}')).rejects.toThrow(
      /content_pages_body_shape/,
    );
    await expect(insert('{"version":1,"blocks":[]}')).rejects.toThrow(
      /content_pages_body_shape/,
    );
  });

  it("ACCEPTS a body whose three keys hold complete nonsense", async () => {
    // This is the finding. The CHECK proves the keys exist and nothing more:
    // `blocks` may be a string, `version` may be a boolean, and a block may
    // be of a type outside the palette. Everything below the top level is
    // application-level validation's job.
    await expect(
      insert('{"version":"banana","blocks":"not-an-array","refs":7}'),
    ).resolves.toBeDefined();

    await expect(
      insert('{"version":1,"blocks":[{"type":"raw_html"}],"refs":{}}'),
    ).resolves.toBeDefined();
  });
});

describe("finding 3 — JSONB cannot reference a collection with integrity", () => {
  it("accepts a finder block naming a collection that does not exist", async () => {
    // Postgres has no way to enforce body.blocks[].collection against
    // data_collections.key. Validation rules 5 to 7 are the only defence.
    await expect(
      db.query(
        `insert into content_pages (url, slug, schema_name, document_type, title, body)
         values ('/dangling-finder', 'x', 'finder', 'x', 'x',
                 '{"version":1,"refs":{},"blocks":[{"id":"b1","type":"finder","collection":"does-not-exist"}]}'::jsonb)`,
      ),
    ).resolves.toBeDefined();
  });

  it("DOES enforce the same reference when it is a real column", async () => {
    // The contrast: collection_records.collection_key is a foreign key and
    // behaves exactly as you would want the JSONB pointer to.
    await expect(
      db.query(
        `insert into collection_records (collection_key, record_key, data)
         values ('does-not-exist', 'x', '{}'::jsonb)`,
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it("refuses to drop a collection that still has records", async () => {
    await expect(
      db.query(`delete from data_collections where key = 'pharmacies'`),
    ).rejects.toThrow(/foreign key|violates/i);
  });
});

describe("finding 5 — is the GIN index used by the finder filter query", () => {
  const explain = async (sql: string) => {
    const result = await db.query<{ "QUERY PLAN": string }>(`explain ${sql}`);
    return result.rows.map((row) => row["QUERY PLAN"]).join("\n");
  };

  /** Every finder query is scoped to its collection. */
  const scoped = `select * from collection_records
     where collection_key = 'pharmacies'
       and data @> '{"parish":"St. Michael"}'::jsonb`;

  it("is NOT used by a collection-scoped containment filter", async () => {
    // The answer the acceptance criterion asks for, recorded either way.
    // The planner reaches for the (collection_key, record_key) unique btree
    // because the collection equality is the selective term, and applies
    // the JSONB containment as a post-filter. That holds even with
    // sequential scans disabled, so it is not a row-count artefact.
    const plan = await explain(scoped);
    expect(plan).not.toMatch(/collection_records_data_idx/);

    await db.query("set enable_seqscan = off");
    const forced = await explain(scoped);
    await db.query("set enable_seqscan = on");

    expect(forced).not.toMatch(/collection_records_data_idx/);
    expect(forced).toMatch(/collection_records_collection_key_record_key_key/);
    console.log("\n[finding 5] collection-scoped @> filter:\n" + forced + "\n");
  });

  it("IS reachable when the collection predicate is removed", async () => {
    // Proof the index is well-formed and jsonb_path_ops supports the
    // operator — it simply never wins against the collection key.
    await db.query("set enable_seqscan = off");
    const plan = await explain(
      `select * from collection_records
        where data @> '{"parish":"St. Michael"}'::jsonb`,
    );
    await db.query("set enable_seqscan = on");
    console.log("\n[finding 5] unscoped @> filter:\n" + plan + "\n");
    expect(plan).toMatch(/collection_records_data_idx/);
  });

  it("cannot serve the facets the pharmacy finder actually uses", async () => {
    // jsonb_path_ops indexes containment only. `openNow` is a time-of-day
    // computation over `hours`, `subsidisedOnly` spans two fields, and
    // `slip` is derived from both — none is expressible as @>, so no
    // amount of planner coaxing puts this index on the path.
    await db.query("set enable_seqscan = off");
    const plan = await explain(
      `select * from collection_records
        where collection_key = 'pharmacies'
          and data->>'type' = 'private'
          and data->>'pppStatus' = 'participating'`,
    );
    await db.query("set enable_seqscan = on");
    console.log("\n[finding 5] two-field predicate:\n" + plan + "\n");
    expect(plan).not.toMatch(/collection_records_data_idx/);
  });
});
