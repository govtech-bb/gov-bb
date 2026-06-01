// Ingest CLI. Run via `pnpm ingest`.
//
//   pnpm ingest                     # full reconcile
//   pnpm ingest --dry-run           # print plan, no writes
//   pnpm ingest --report            # coverage stats
//   pnpm ingest --reset-embeddings  # accept embedding-model change

// Env loaded by `tsx --env-file-if-exists=.env.local` in the pnpm script.
import { randomUUID } from "node:crypto";
import { count, sql } from "drizzle-orm";
import { loadContent } from "@govtech-bb/content";
import { getDb, hasDatabase, schema } from "#/lib/db";
import { chunkService, type PlannedEntity } from "./chunker";
import { applyDeletes, buildPlan, summarise } from "./plan";
import { applyPlan } from "./write";

interface Args {
  dryRun: boolean;
  report: boolean;
  resetEmbeddings: boolean;
  contentDir?: string;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  const limitStr = argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
  return {
    dryRun: argv.includes("--dry-run"),
    report: argv.includes("--report"),
    resetEmbeddings: argv.includes("--reset-embeddings"),
    contentDir: argv.find((a) => a.startsWith("--content-dir="))?.split("=")[1],
    limit: limitStr ? Number(limitStr) : undefined,
  };
}

function modelId(): string {
  const provider = process.env.EMBED_PROVIDER ?? "local";
  if (provider === "bedrock") {
    return process.env.BEDROCK_EMBED_MODEL ?? "amazon.titan-embed-text-v2:0";
  }
  return "local:sentence-transformers/all-MiniLM-L6-v2";
}

async function preflight(
  model: string,
  resetEmbeddings: boolean,
): Promise<void> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ embeddingModel: schema.documents.embeddingModel })
    .from(schema.documents);
  const others = rows.map((r) => r.embeddingModel).filter((m) => m !== model);
  if (others.length === 0) return;
  if (!resetEmbeddings) {
    throw new Error(
      `Embedding model mismatch: DB has [${others.join(", ")}], CLI is using "${model}". ` +
        `Re-run with --reset-embeddings to drop and rebuild (will re-embed everything).`,
    );
  }
  console.log(
    `[ingest] resetting: dropping all chunks/documents with model(s) ${others.join(", ")}`,
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
  for (const r of docs) console.log(`  ${r.kind.padEnd(15)} ${r.count}`);
  console.log("\n=== chunks by kind ===");
  for (const r of chunks) console.log(`  ${r.kind.padEnd(15)} ${r.count}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.report && !args.dryRun) {
    if (!hasDatabase()) throw new Error("DATABASE_URL not set");
    await printReport();
    process.exit(0);
  }

  if (!hasDatabase()) throw new Error("DATABASE_URL not set");
  const model = modelId();
  console.log(`[ingest] embedding_model=${model}`);

  await preflight(model, args.resetEmbeddings);

  const content = await loadContent({ contentDir: args.contentDir });
  if (content.warnings.length) {
    for (const w of content.warnings) console.warn(`[content] ${w}`);
  }
  console.log(`[ingest] loaded ${content.services.length} services`);

  let planned: PlannedEntity[] = content.services.map(chunkService);
  if (args.limit !== undefined) {
    planned = planned.slice(0, args.limit);
    console.log(`[ingest] --limit=${args.limit} → ${planned.length} entities`);
  }

  const plan = await buildPlan(planned, model);
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
  await db.insert(schema.ingestRuns).values({
    id: runId,
    status: "running",
    summary: { ...summary },
  });

  try {
    await applyDeletes(plan);

    const start = Date.now();
    let lastTick = start;
    const reportEvery = 25;
    await applyPlan(plan, model, (e) => {
      const now = Date.now();
      const isFirst = e.done === 1;
      const isLast = e.done === e.total;
      const elapsedMs = now - lastTick;
      if (!isFirst && !isLast && e.done % reportEvery !== 0) return;
      lastTick = now;
      const totalElapsedSec = ((now - start) / 1000).toFixed(1);
      const pct = ((e.done / e.total) * 100).toFixed(0);
      // ETA from average rate so far
      const rate = e.done / ((now - start) / 1000); // items/sec
      const remaining = rate > 0 ? Math.round((e.total - e.done) / rate) : 0;
      const recent =
        elapsedMs > 0 && reportEvery > 0
          ? ` (~${(elapsedMs / reportEvery).toFixed(0)}ms/item)`
          : "";
      console.log(
        `[ingest] ${e.phase}: ${e.done}/${e.total} ${pct}% ` +
          `elapsed=${totalElapsedSec}s eta=${remaining}s${recent} last=${e.lastId ?? "?"}`,
      );
    });

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
