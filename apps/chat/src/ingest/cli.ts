// Ingest CLI. Run via `pnpm ingest` (env loaded by the pnpm script's
// --env-file-if-exists flags). Needs DATABASE_URL + AWS creds for Bedrock.
//
// Source: when API_V2_URL is set, content comes from api_v2 (/catalog + /pages,
// public pages only); otherwise from the landing markdown. A failed api_v2 read
// fails the run, keeping the last snapshot — it never falls back to markdown.
//
//   pnpm ingest                     # full reconcile (prune orphans)
//   pnpm ingest --dry-run           # print the plan, no writes
//   pnpm ingest --report            # coverage stats by kind
//   pnpm ingest --limit=10          # diff the first N services (never prunes)
//   pnpm ingest --reset-embeddings  # accept an embedding-model change (drops all)

import { randomUUID } from "node:crypto";
import { count, sql } from "drizzle-orm";
import { loadContent, type ServiceEntity } from "@govtech-bb/content";
import { getDb, hasDatabase, schema } from "#/lib/db";
import { MODEL_ID } from "#/lib/rag/embed";
import { chunkService, type PlannedEntity } from "./chunker";
import { planIngest, summarise, withoutPruning } from "./plan";
import { applyDeletes, applyPlan, fetchExistingState } from "./write";
import { loadApiV2Content } from "./api-v2-source";

interface Args {
  dryRun: boolean;
  report: boolean;
  resetEmbeddings: boolean;
  force: boolean;
  contentDir?: string;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  const limitStr = argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
  return {
    dryRun: argv.includes("--dry-run"),
    report: argv.includes("--report"),
    resetEmbeddings: argv.includes("--reset-embeddings"),
    force: argv.includes("--force"),
    contentDir: argv.find((a) => a.startsWith("--content-dir="))?.split("=")[1],
    limit: limitStr ? Number(limitStr) : undefined,
  };
}

// A stored embedding from a different model can't be mixed into one index. If
// the DB holds another model, refuse unless --reset-embeddings (and --force,
// since the reset drops everything and re-embeds from scratch).
async function preflight(
  resetEmbeddings: boolean,
  force: boolean,
): Promise<void> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ embeddingModel: schema.documents.embeddingModel })
    .from(schema.documents);
  const others = rows
    .map((r) => r.embeddingModel)
    .filter((m) => m !== MODEL_ID);
  if (others.length === 0) return;
  if (!resetEmbeddings) {
    throw new Error(
      `Embedding model mismatch: DB has [${others.join(", ")}], CLI uses "${MODEL_ID}". ` +
        `Re-run with --reset-embeddings to drop and rebuild.`,
    );
  }
  if (!force) {
    throw new Error(
      `--reset-embeddings will DROP all chunks and documents (model(s) [${others.join(", ")}]). ` +
        `Irreversible — re-run with --force to confirm.`,
    );
  }
  console.log(
    `[ingest] resetting: dropping all rows (model(s) ${others.join(", ")})`,
  );
  await db.delete(schema.chunks).where(sql`true`);
  await db.delete(schema.documents).where(sql`true`);
}

async function printReport(): Promise<void> {
  const db = await getDb();
  const docs = await db
    .select({ kind: schema.documents.kind, count: count() })
    .from(schema.documents)
    .groupBy(schema.documents.kind);
  const chunks = await db
    .select({ kind: schema.chunks.kind, count: count() })
    .from(schema.chunks)
    .groupBy(schema.chunks.kind);
  console.log("\n=== documents by kind ===");
  for (const r of docs) console.log(`  ${r.kind.padEnd(12)} ${r.count}`);
  console.log("\n=== chunks by kind ===");
  for (const r of chunks) console.log(`  ${r.kind.padEnd(12)} ${r.count}`);
}

function logProgress(start: number) {
  let lastTick = start;
  const reportEvery = 25;
  return (e: {
    phase: string;
    done: number;
    total: number;
    lastId?: string;
  }) => {
    const now = Date.now();
    const isFirst = e.done === 1;
    const isLast = e.done === e.total;
    if (!isFirst && !isLast && e.done % reportEvery !== 0) return;
    const recentMs = now - lastTick;
    lastTick = now;
    const pct = ((e.done / e.total) * 100).toFixed(0);
    const rate = e.done / ((now - start) / 1000);
    const eta = rate > 0 ? Math.round((e.total - e.done) / rate) : 0;
    const perItem = !isFirst
      ? ` (~${(recentMs / reportEvery).toFixed(0)}ms/item)`
      : "";
    console.log(
      `[ingest] ${e.phase}: ${e.done}/${e.total} ${pct}% eta=${eta}s${perItem} last=${e.lastId ?? "?"}`,
    );
  };
}

async function loadServices(contentDir?: string): Promise<ServiceEntity[]> {
  const apiV2Url = process.env.API_V2_URL;
  if (apiV2Url) {
    if (contentDir) {
      throw new Error(
        "--content-dir reads markdown; unset API_V2_URL to use it",
      );
    }
    console.log(`[ingest] source=api_v2 ${apiV2Url}`);
    return loadApiV2Content(apiV2Url);
  }
  console.log("[ingest] source=markdown");
  const content = await loadContent({ contentDir });
  for (const w of content.warnings) console.warn(`[content] ${w}`);
  return content.services;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!hasDatabase()) throw new Error("DATABASE_URL not set");

  if (args.report && !args.dryRun) {
    await printReport();
    process.exit(0);
  }

  console.log(`[ingest] embedding_model=${MODEL_ID}`);
  await preflight(args.resetEmbeddings, args.force);

  const services = await loadServices(args.contentDir);
  console.log(`[ingest] loaded ${services.length} services`);

  let planned: PlannedEntity[] = services.map(chunkService);
  if (args.limit !== undefined) {
    planned = planned.slice(0, args.limit);
    console.log(`[ingest] --limit=${args.limit} → ${planned.length} entities`);
  }

  const existing = await fetchExistingState();
  const scoped = args.limit !== undefined || args.contentDir !== undefined;
  let plan = planIngest(planned, existing, MODEL_ID);
  if (scoped) {
    if (plan.documents.orphans.length || plan.chunks.orphans.length) {
      console.log(
        `[ingest] scoped run: keeping ${plan.documents.orphans.length} doc / ${plan.chunks.orphans.length} chunk(s) that look orphaned (run a full ingest to prune)`,
      );
    }
    plan = withoutPruning(plan);
  }

  const summary = summarise(plan);
  console.log("[ingest] plan:");
  console.log(
    `  docs    new=${summary.docsNew} changed=${summary.docsChanged} unchanged=${summary.docsUnchanged} orphan=${summary.docsOrphan}`,
  );
  console.log(
    `  chunks  new=${summary.chunksNew} re-embed=${summary.chunksReEmbed} unchanged=${summary.chunksUnchanged} orphan=${summary.chunksOrphan}`,
  );
  console.log(`  bedrock_calls=${summary.bedrockCalls}`);

  if (args.dryRun) {
    console.log("[ingest] --dry-run, exiting");
    process.exit(0);
  }

  const db = await getDb();
  const runId = randomUUID();
  await db
    .insert(schema.ingestRuns)
    .values({ id: runId, status: "running", summary: { ...summary } });

  try {
    // Upsert first, prune last: the ids are disjoint, so a run that fails
    // mid-embed keeps the old rows instead of leaving a half-empty index.
    await applyPlan(plan, MODEL_ID, { onProgress: logProgress(Date.now()) });
    await applyDeletes(plan);
    await db
      .update(schema.ingestRuns)
      .set({
        status: "success",
        finishedAt: sql`now()`,
        summary: { ...summary },
      })
      .where(sql`id = ${runId}`);
    console.log("[ingest] done");
    if (args.report) await printReport();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.ingestRuns)
      .set({ status: "failed", finishedAt: sql`now()`, errorMessage: message })
      .where(sql`id = ${runId}`);
    throw err;
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
