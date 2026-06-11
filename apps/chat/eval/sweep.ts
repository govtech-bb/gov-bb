// Hyperparameter sweep for RAG retrieval.
//
// Phase 1: embed each golden query once (Bedrock), cache to .cache/.
// Phase 2: one SQL per query at a permissive floor, capture top-30 raw rows
//          + their cosine sim. Cache to .cache/.
// Phase 3: replay every (similarity, scoreThresh, topK, maxSources, weights)
//          combination over the cached rows in pure JS. Rank by composite
//          score. Print top 25 + write full results to results.json.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/index";
import { embed } from "../src/lib/rag/embed";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CACHE_DIR = join(HERE, ".cache");
const GOLDEN_PATH = join(HERE, "golden.json");
const EMBED_CACHE = join(CACHE_DIR, "embeddings.json");
const ROWS_CACHE = join(CACHE_DIR, "rows.json");
const RESULTS_PATH = join(HERE, "results.json");

const PROBE_FLOOR = 0.2; // permissive — re-filter in JS per config
const PROBE_LIMIT = 30;

interface Entry {
  id: string;
  query: string;
  expected_doc_ids: string[];
  tag: "direct" | "followup" | "ambig" | "none";
  // Alternative REAL-USER phrasings of the same need (paraphrases, Bajan
  // dialect) expecting the same docs. The hand-written `query` tends to be
  // the lexically-friendly phrasing; retrieval must hold up on the others
  // too. Expanded into synthetic entries (`<id>-v1`, ...) at load.
  variants?: string[];
}

interface Golden {
  entries: Entry[];
}

interface RawRow extends Record<string, unknown> {
  document_id: string;
  doc_kind: string;
  sim: number; // raw cosine [0..1]
}

type RowsByQueryId = Record<string, RawRow[]>;

interface Config {
  similarity: number;
  scoreThresh: number;
  topK: number;
  maxSources: number;
  serviceWeight: number;
  newsWeight: number;
}

interface ConfigResult {
  config: Config;
  recall: number; // recall@maxSources, on expected-doc entries only
  mrr: number; // 1 / rank of first expected doc within delivered set
  precisionAt1: number; // top-1 hit rate
  ambigCoverage: number; // for ambig: fraction of expected docs covered in topN
  fp: number; // for `none` entries: fraction with at least one delivered row
  composite: number;
}

function loadGolden(): Golden {
  const raw = JSON.parse(readFileSync(GOLDEN_PATH, "utf-8")) as Golden;
  const entries = raw.entries.flatMap((e) => [
    e,
    ...(e.variants ?? []).map((query, i) => ({
      ...e,
      id: `${e.id}-v${i + 1}`,
      query,
      variants: undefined,
    })),
  ]);
  return { entries };
}

async function buildEmbedCache(
  entries: Entry[],
): Promise<Record<string, number[]>> {
  if (existsSync(EMBED_CACHE)) {
    const cached = JSON.parse(readFileSync(EMBED_CACHE, "utf-8")) as Record<
      string,
      number[]
    >;
    const missing = entries.filter((e) => !cached[e.id]);
    if (missing.length === 0) {
      console.log(`[embed-cache] hit (${entries.length})`);
      return cached;
    }
    console.log(`[embed-cache] partial; embedding ${missing.length}`);
    for (const e of missing) {
      cached[e.id] = await embed(e.query);
      process.stdout.write(".");
    }
    process.stdout.write("\n");
    writeFileSync(EMBED_CACHE, JSON.stringify(cached));
    return cached;
  }
  console.log(`[embed-cache] miss; embedding ${entries.length} queries`);
  const out: Record<string, number[]> = {};
  for (const e of entries) {
    out[e.id] = await embed(e.query);
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(EMBED_CACHE, JSON.stringify(out));
  return out;
}

async function buildRowsCache(
  entries: Entry[],
  embeddings: Record<string, number[]>,
): Promise<RowsByQueryId> {
  if (existsSync(ROWS_CACHE)) {
    console.log(`[rows-cache] hit`);
    return JSON.parse(readFileSync(ROWS_CACHE, "utf-8")) as RowsByQueryId;
  }
  console.log(`[rows-cache] miss; probing DB for ${entries.length} queries`);
  const db = await getDb();
  const out: RowsByQueryId = {};
  for (const e of entries) {
    const vector = embeddings[e.id];
    if (!vector) throw new Error(`no embedding for ${e.id}`);
    const literal = JSON.stringify(vector);
    const result = await db.execute<RawRow>(sql`
      WITH ranked AS (
        SELECT
          d.id AS document_id,
          d.kind AS doc_kind,
          1 - (c.embedding <=> ${literal}::vector) AS sim,
          ROW_NUMBER() OVER (
            PARTITION BY d.id
            ORDER BY 1 - (c.embedding <=> ${literal}::vector) DESC
          ) AS rank
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE d.metadata->>'status' IS DISTINCT FROM 'draft'
      )
      SELECT document_id, doc_kind, sim
      FROM ranked
      WHERE rank = 1 AND sim > ${PROBE_FLOOR}
      ORDER BY sim DESC
      LIMIT ${PROBE_LIMIT}
    `);
    out[e.id] = result.rows.map((r) => ({
      document_id: String(r.document_id),
      doc_kind: String(r.doc_kind),
      sim: Number(r.sim),
    }));
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(ROWS_CACHE, JSON.stringify(out));
  return out;
}

// Note: weights stay parameterised in the sweep (we want to tune them) even
// though prod imports static weights from src/lib/chat/rag-config.ts.
function weightFor(kind: string, c: Config): number {
  if (kind === "service") return c.serviceWeight;
  if (kind === "news") return c.newsWeight;
  return 1.0;
}

// Reproduce production pipeline: SQL floor → rerank → topK → score floor → maxSources.
function deliveredDocs(rows: RawRow[], c: Config): string[] {
  const filtered = rows.filter((r) => r.sim > c.similarity);
  const reranked = filtered
    .map((r) => ({ ...r, score: r.sim * weightFor(r.doc_kind, c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, c.topK);
  const final = reranked
    .filter((r) => r.score >= c.scoreThresh)
    .slice(0, c.maxSources);
  return final.map((r) => r.document_id);
}

function cartesian<T extends Record<string, readonly unknown[]>>(
  grid: T,
): Array<{ [K in keyof T]: T[K][number] }> {
  const keys = Object.keys(grid) as Array<keyof T>;
  const out: Array<Record<string, unknown>> = [{}];
  for (const k of keys) {
    const next: Array<Record<string, unknown>> = [];
    for (const prefix of out)
      for (const v of grid[k]) next.push({ ...prefix, [k as string]: v });
    out.length = 0;
    out.push(...next);
  }
  return out as Array<{ [K in keyof T]: T[K][number] }>;
}

function evaluate(
  entries: Entry[],
  rows: RowsByQueryId,
  c: Config,
): ConfigResult {
  let recallHits = 0;
  let recallN = 0;
  let mrrSum = 0;
  let precHits = 0;
  let precN = 0;
  let ambigCoverSum = 0;
  let ambigN = 0;
  let fpHits = 0;
  let fpN = 0;

  for (const e of entries) {
    const delivered = deliveredDocs(rows[e.id] ?? [], c);

    if (e.tag === "none") {
      fpN++;
      if (delivered.length > 0) fpHits++;
      continue;
    }

    if (e.expected_doc_ids.length === 0) continue;

    if (e.tag === "ambig") {
      ambigN++;
      const covered = e.expected_doc_ids.filter((d) =>
        delivered.includes(d),
      ).length;
      ambigCoverSum += covered / e.expected_doc_ids.length;
      continue;
    }

    // direct / followup → single (or few) expected docs.
    recallN++;
    const idx = delivered.findIndex((d) => e.expected_doc_ids.includes(d));
    if (idx >= 0) {
      recallHits++;
      mrrSum += 1 / (idx + 1);
    }
    precN++;
    if (delivered.length > 0 && e.expected_doc_ids.includes(delivered[0]))
      precHits++;
  }

  const recall = recallN ? recallHits / recallN : 0;
  const mrr = recallN ? mrrSum / recallN : 0;
  const precisionAt1 = precN ? precHits / precN : 0;
  const ambigCoverage = ambigN ? ambigCoverSum / ambigN : 0;
  const fp = fpN ? fpHits / fpN : 0;

  // Composite: lean on recall + MRR, reward precision@1, reward ambig coverage,
  // penalise false positives on greetings/off-topic.
  const composite =
    0.4 * recall +
    0.25 * mrr +
    0.2 * precisionAt1 +
    0.1 * ambigCoverage -
    0.3 * fp;

  return { config: c, recall, mrr, precisionAt1, ambigCoverage, fp, composite };
}

function formatConfig(c: Config): string {
  return `sim=${c.similarity} score=${c.scoreThresh} topK=${c.topK} max=${c.maxSources} svc=${c.serviceWeight}`;
}

async function main() {
  const golden = loadGolden();
  console.log(`[golden] ${golden.entries.length} entries`);
  const embeddings = await buildEmbedCache(golden.entries);
  const rows = await buildRowsCache(golden.entries, embeddings);

  const grid = {
    similarity: [0.25, 0.3, 0.35, 0.4, 0.45] as const,
    scoreThresh: [0.3, 0.35, 0.4, 0.42, 0.45, 0.5] as const,
    topK: [6, 8, 10, 12] as const,
    maxSources: [4, 5, 6, 7] as const,
    serviceWeight: [1.0, 1.1, 1.2, 1.3] as const,
    newsWeight: [0.7] as const,
  };
  const configs = cartesian(grid);
  console.log(
    `[sweep] ${configs.length} configs × ${golden.entries.length} entries`,
  );

  const results: ConfigResult[] = configs.map((c) =>
    evaluate(golden.entries, rows, c),
  );
  results.sort((a, b) => b.composite - a.composite);

  console.log("\nTop 25 configs by composite score:");
  console.log("rank  composite  recall  mrr    p@1   ambig  fp    config");
  for (let i = 0; i < Math.min(25, results.length); i++) {
    const r = results[i];
    console.log(
      [
        String(i + 1).padStart(4),
        r.composite.toFixed(4).padStart(9),
        r.recall.toFixed(3).padStart(6),
        r.mrr.toFixed(3).padStart(6),
        r.precisionAt1.toFixed(3).padStart(5),
        r.ambigCoverage.toFixed(3).padStart(6),
        r.fp.toFixed(3).padStart(5),
        formatConfig(r.config),
      ].join("  "),
    );
  }

  // Marginal analysis: for each param, fix others at the best config's value
  // and show how the param alone moves composite.
  console.log("\nMarginal analysis around #1 winner:");
  const best = results[0].config;
  for (const key of Object.keys(grid) as Array<keyof typeof grid>) {
    if (grid[key].length === 1) continue;
    const slice: Array<{ v: number; r: ConfigResult }> = [];
    for (const v of grid[key]) {
      const c = { ...best, [key]: v } as Config;
      slice.push({ v: Number(v), r: evaluate(golden.entries, rows, c) });
    }
    const line = slice
      .map((s) => `${s.v}=${s.r.composite.toFixed(3)}`)
      .join("  ");
    console.log(`  ${String(key).padEnd(15)} ${line}`);
  }

  writeFileSync(RESULTS_PATH, JSON.stringify(results.slice(0, 100), null, 2));
  console.log(`\n[done] wrote top 100 to ${RESULTS_PATH}`);

  // Per-query inspection of the winner — flag entries that miss under best config.
  console.log("\nPer-query results under winner:");
  for (const e of golden.entries) {
    const delivered = deliveredDocs(rows[e.id] ?? [], best);
    let status = "OK ";
    if (e.tag === "none") {
      status = delivered.length === 0 ? "OK " : "FP ";
    } else if (e.tag === "ambig") {
      const covered = e.expected_doc_ids.filter((d) =>
        delivered.includes(d),
      ).length;
      status =
        covered > 0 ? `OK (${covered}/${e.expected_doc_ids.length})` : "MISS";
    } else {
      const hit = delivered.findIndex((d) => e.expected_doc_ids.includes(d));
      status = hit === 0 ? "TOP" : hit > 0 ? `R${hit + 1}` : "MISS";
    }
    const preview = delivered.slice(0, 3).join(", ") || "(empty)";
    console.log(
      `  ${status.padEnd(8)} ${e.id.padEnd(28)} ${e.tag.padEnd(8)} → ${preview}`,
    );
  }

  await (await getDb()).$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
