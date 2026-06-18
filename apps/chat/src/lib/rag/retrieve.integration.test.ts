import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { hasDatabase, schema, type Database } from "#/lib/db";
import { searchByVector } from "./retrieve.ts";
import { MAX_CHUNKS_PER_DOC, SIMILARITY_THRESHOLD, TOP_K } from "./config.ts";
import type { Source } from "./types.ts";

// Live retrieval integration — exercises the SQL probe (per-doc rank cap,
// similarity floor, draft/preview gate, ordering) against a real pgvector,
// using crafted UNIT vectors so cosine similarity is exact and deterministic.
// Runs only when DATABASE_URL is set (skips cleanly in CI / offline, like the
// db connectivity test). Uses its own pool — independent of getDb()'s singleton,
// which the connectivity test ends — and filters results to a `test-fixture-`
// id prefix so the real ingested corpus can't perturb assertions. All fixtures
// are removed before and after each test.

const enabled = hasDatabase();
const PREFIX = "test-fixture-";
const DIMS = 1024;

// A unit vector whose cosine similarity to QUERY (= e0) is exactly `sim`:
// [sim, sqrt(1 - sim²), 0, …] · [1, 0, …] = sim, and |v| = 1.
function vec(sim: number): number[] {
  const v = new Array<number>(DIMS).fill(0);
  v[0] = sim;
  v[1] = Math.sqrt(Math.max(0, 1 - sim * sim));
  return v;
}
const QUERY = vec(1); // e0
const ORTHOGONAL = (() => {
  const v = new Array<number>(DIMS).fill(0);
  v[500] = 1; // cosine 0 to every fixture (which live in dims 0/1)
  return v;
})();

let pool: pg.Pool | null = null;
let db: Database;

before(() => {
  if (!enabled) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema, casing: "snake_case" }) as Database;
});
after(async () => {
  if (pool) await pool.end();
});

async function cleanup() {
  if (!enabled) return;
  await db.execute(sql`DELETE FROM documents WHERE id LIKE ${PREFIX + "%"}`);
}
beforeEach(cleanup);
afterEach(cleanup);

// Seed one document + a chunk per similarity. Chunk text encodes its sim so we
// can identify which survived.
async function seedDoc(id: string, status: string, sims: number[]) {
  await db.insert(schema.documents).values({
    id,
    kind: "service",
    slug: id,
    title: id,
    url: `https://alpha.gov.bb/${id}`,
    payloadHash: "h",
    embeddingModel: "test",
    metadata: { status },
  });
  await db.insert(schema.chunks).values(
    sims.map((sim, i) => ({
      id: `${id}-c${i}`,
      documentId: id,
      kind: "section" as const,
      chunkIndex: i,
      text: `${id} sim=${sim}`,
      payload: { heading: `s${i}` },
      embedHash: `${id}-h${i}`,
      embedding: vec(sim),
    })),
  );
}

const fixtures = (sources: Source[]) =>
  sources.filter((s) => s.id.startsWith(PREFIX));

test("keeps at most MAX_CHUNKS_PER_DOC per document, above the similarity floor", async (t) => {
  if (!enabled) return t.skip("no DATABASE_URL");
  // 5 sections; 4 above the floor, 1 below it.
  await seedDoc(`${PREFIX}multi`, "published", [0.9, 0.85, 0.8, 0.75, 0.2]);

  const { sources } = await searchByVector(QUERY, TOP_K, db);
  const mine = fixtures(sources);

  assert.equal(mine.length, MAX_CHUNKS_PER_DOC, "capped per-doc");
  // The sub-floor (0.2) chunk is excluded; every kept score clears the floor.
  for (const s of mine) assert.ok(s.score > SIMILARITY_THRESHOLD);
  assert.ok(
    mine.every((s) => s.score >= 0.74),
    "kept the four highest, dropped the 0.2",
  );
});

test("excludes draft / preview documents (visibility gate)", async (t) => {
  if (!enabled) return t.skip("no DATABASE_URL");
  await seedDoc(`${PREFIX}live`, "published", [0.8]);
  await seedDoc(`${PREFIX}draft`, "draft", [0.95]); // higher sim, must NOT win
  await seedDoc(`${PREFIX}preview`, "preview", [0.95]);

  const { sources } = await searchByVector(QUERY, TOP_K, db);
  const ids = fixtures(sources).map((s) => s.id);

  assert.deepEqual(ids, [`${PREFIX}live`], "only the published doc survives");
});

test("surfaces a service's 3rd/4th section — the cost-abstention fix", async (t) => {
  if (!enabled) return t.skip("no DATABASE_URL");
  // The bug: at a per-doc cap of 2, a 3rd-ranked relevant section (e.g. the
  // "$5 cost" of get-death-certificate) was dropped, forcing an abstention.
  await seedDoc(`${PREFIX}svc`, "published", [0.9, 0.85, 0.8, 0.7]);

  const { sources } = await searchByVector(QUERY, TOP_K, db);
  const scores = fixtures(sources)
    .map((s) => s.score)
    .sort((a, b) => b - a);

  assert.ok(scores.length >= 3, "more than the old 2-per-doc cap");
  assert.ok(
    scores.some((s) => Math.abs(s - 0.8) < 0.02),
    "the previously-dropped 3rd section is now retrieved",
  );
});

test("results are ordered by similarity descending, across documents", async (t) => {
  if (!enabled) return t.skip("no DATABASE_URL");
  await seedDoc(`${PREFIX}a`, "published", [0.6]);
  await seedDoc(`${PREFIX}b`, "published", [0.9]);
  await seedDoc(`${PREFIX}c`, "published", [0.75]);

  const { sources } = await searchByVector(QUERY, TOP_K, db);
  const scores = fixtures(sources).map((s) => s.score);

  assert.deepEqual(
    scores,
    [...scores].sort((a, b) => b - a),
    "sorted desc",
  );
  assert.equal(fixtures(sources).length, 3);
});

test("returns nothing for a query orthogonal to the corpus (floor)", async (t) => {
  if (!enabled) return t.skip("no DATABASE_URL");
  await seedDoc(`${PREFIX}svc`, "published", [0.9, 0.8]);

  const { sources } = await searchByVector(ORTHOGONAL, TOP_K, db);
  assert.equal(fixtures(sources).length, 0, "cosine 0 is below the floor");
});
