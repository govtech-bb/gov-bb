// Embed + upsert + prune. The diff (plan.ts) is pure; this is the side-effecting
// half — it reads the stored state, calls Bedrock only for {new, reEmbed}
// chunks, and applies the plan to the DB. Streams progress so a long ingest has
// a heartbeat.

import { inArray, sql } from "drizzle-orm";
import { getDb, schema } from "#/lib/db";
import { embedWithRetry } from "#/lib/rag/embed";
import type { PlannedChunk, PlannedDocument } from "./chunker";
import type { ExistingState, IngestPlan } from "./plan";

interface ProgressEvent {
  phase: "documents" | "chunks";
  done: number;
  total: number;
  /** Last item's id, for context — e.g. "service-renew-passport". */
  lastId?: string;
}
export type ProgressFn = (e: ProgressEvent) => void;

// Just the columns the diff needs — read the whole store in two queries.
export async function fetchExistingState(): Promise<ExistingState> {
  const db = await getDb();
  const documents = await db
    .select({
      id: schema.documents.id,
      payloadHash: schema.documents.payloadHash,
      embeddingModel: schema.documents.embeddingModel,
    })
    .from(schema.documents);
  const chunks = await db
    .select({
      id: schema.chunks.id,
      documentId: schema.chunks.documentId,
      embedHash: schema.chunks.embedHash,
    })
    .from(schema.chunks);
  return { documents, chunks };
}

async function upsertDocuments(
  docs: PlannedDocument[],
  embeddingModel: string,
  onProgress?: ProgressFn,
): Promise<void> {
  if (docs.length === 0) return;
  const db = await getDb();
  let done = 0;
  for (const d of docs) {
    const values = {
      id: d.id,
      kind: d.kind,
      slug: d.slug,
      title: d.title,
      url: d.url,
      sourceUrl: d.sourceUrl,
      metadata: d.metadata,
      payloadHash: d.payloadHash,
      embeddingModel,
    };
    await db
      .insert(schema.documents)
      .values(values)
      .onConflictDoUpdate({
        target: schema.documents.id,
        set: { ...values, updatedAt: sql`now()` },
      });
    onProgress?.({
      phase: "documents",
      done: ++done,
      total: docs.length,
      lastId: d.id,
    });
  }
}

// embed is injectable (defaults to the retrying Bedrock embedder), mirroring
// embed.ts's `send` — so this is swappable in a DB-only test without Bedrock.
async function embedAndUpsertChunks(
  chunks: PlannedChunk[],
  embed: (text: string) => Promise<number[]>,
  onProgress?: ProgressFn,
): Promise<void> {
  if (chunks.length === 0) return;
  const db = await getDb();
  let done = 0;
  for (const c of chunks) {
    const embedding = await embed(c.text);
    const values = {
      id: c.id,
      documentId: c.documentId,
      kind: c.kind,
      chunkIndex: c.chunkIndex,
      text: c.text,
      payload: c.payload,
      embedHash: c.embedHash,
      embedding,
    };
    await db
      .insert(schema.chunks)
      .values(values)
      .onConflictDoUpdate({
        target: schema.chunks.id,
        set: { ...values, updatedAt: sql`now()` },
      });
    onProgress?.({
      phase: "chunks",
      done: ++done,
      total: chunks.length,
      lastId: c.id,
    });
  }
}

export async function applyDeletes(plan: IngestPlan): Promise<void> {
  const db = await getDb();
  if (plan.documents.orphans.length) {
    await db
      .delete(schema.documents)
      .where(inArray(schema.documents.id, plan.documents.orphans));
  }
  if (plan.chunks.orphans.length) {
    await db
      .delete(schema.chunks)
      .where(inArray(schema.chunks.id, plan.chunks.orphans));
  }
}

export async function applyPlan(
  plan: IngestPlan,
  embeddingModel: string,
  opts?: {
    embed?: (text: string) => Promise<number[]>;
    onProgress?: ProgressFn;
  },
): Promise<void> {
  // Order matters: upsert docs first so chunk FKs resolve.
  await upsertDocuments(
    [...plan.documents.new, ...plan.documents.changed],
    embeddingModel,
    opts?.onProgress,
  );
  await embedAndUpsertChunks(
    [...plan.chunks.new, ...plan.chunks.reEmbed],
    opts?.embed ?? embedWithRetry,
    opts?.onProgress,
  );
}
