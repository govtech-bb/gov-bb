// Diff-based planner. Compares the planned set (from chunker) against the
// rows currently in the DB and classifies each into one of five buckets.
// The CLI then materialises only the work that needs doing.

import { inArray } from "drizzle-orm";
import { getDb, schema } from "#/lib/db";
import type { PlannedChunk, PlannedDocument, PlannedEntity } from "./chunker";

export interface IngestPlan {
  documents: {
    new: PlannedDocument[];
    changed: PlannedDocument[]; // payload_hash differs
    unchanged: PlannedDocument[];
    orphans: string[]; // doc ids in DB that aren't in plan
  };
  chunks: {
    new: PlannedChunk[];
    reEmbed: PlannedChunk[]; // embed_hash differs
    unchanged: PlannedChunk[];
    orphans: string[]; // chunk ids in DB that aren't in plan
  };
}

export interface PlanSummary {
  docsNew: number;
  docsChanged: number;
  docsUnchanged: number;
  docsOrphan: number;
  chunksNew: number;
  chunksReEmbed: number;
  chunksUnchanged: number;
  chunksOrphan: number;
  bedrockCalls: number;
}

export function summarise(plan: IngestPlan): PlanSummary {
  return {
    docsNew: plan.documents.new.length,
    docsChanged: plan.documents.changed.length,
    docsUnchanged: plan.documents.unchanged.length,
    docsOrphan: plan.documents.orphans.length,
    chunksNew: plan.chunks.new.length,
    chunksReEmbed: plan.chunks.reEmbed.length,
    chunksUnchanged: plan.chunks.unchanged.length,
    chunksOrphan: plan.chunks.orphans.length,
    bedrockCalls: plan.chunks.new.length + plan.chunks.reEmbed.length,
  };
}

export async function buildPlan(
  planned: PlannedEntity[],
  embeddingModel: string,
): Promise<IngestPlan> {
  const db = await getDb();

  const plannedDocs = planned.map((p) => p.document);
  const plannedChunks = planned.flatMap((p) => p.chunks);
  const plannedDocIds = new Set(plannedDocs.map((d) => d.id));
  const plannedChunkIds = new Set(plannedChunks.map((c) => c.id));

  const existingDocs = await db
    .select({
      id: schema.documents.id,
      payloadHash: schema.documents.payloadHash,
      embeddingModel: schema.documents.embeddingModel,
    })
    .from(schema.documents);
  const existingDocMap = new Map(existingDocs.map((d) => [d.id, d]));

  const existingChunks = await db
    .select({
      id: schema.chunks.id,
      embedHash: schema.chunks.embedHash,
    })
    .from(schema.chunks);
  const existingChunkMap = new Map(existingChunks.map((c) => [c.id, c]));

  const docs: IngestPlan["documents"] = {
    new: [],
    changed: [],
    unchanged: [],
    orphans: [],
  };
  for (const d of plannedDocs) {
    const ex = existingDocMap.get(d.id);
    if (!ex) docs.new.push(d);
    else if (
      ex.payloadHash !== d.payloadHash ||
      ex.embeddingModel !== embeddingModel
    ) {
      docs.changed.push(d);
    } else docs.unchanged.push(d);
  }
  docs.orphans = existingDocs
    .filter((d) => !plannedDocIds.has(d.id))
    .map((d) => d.id);

  const chunks: IngestPlan["chunks"] = {
    new: [],
    reEmbed: [],
    unchanged: [],
    orphans: [],
  };
  for (const c of plannedChunks) {
    const ex = existingChunkMap.get(c.id);
    if (!ex) chunks.new.push(c);
    else if (ex.embedHash !== c.embedHash) chunks.reEmbed.push(c);
    else chunks.unchanged.push(c);
  }
  // Chunk orphans that aren't already covered by an orphan document. The
  // doc orphans CASCADE-delete their chunks, so we only list chunks whose
  // parent doc is staying. Joining via a fresh SELECT keeps this honest
  // instead of guessing from id prefixes.
  const orphanDocIds = new Set(docs.orphans);
  const orphanChunkRows = await db
    .select({ id: schema.chunks.id, documentId: schema.chunks.documentId })
    .from(schema.chunks);
  chunks.orphans = orphanChunkRows
    .filter(
      (c) => !plannedChunkIds.has(c.id) && !orphanDocIds.has(c.documentId),
    )
    .map((c) => c.id);

  return { documents: docs, chunks };
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
