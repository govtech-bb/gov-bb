// Diff-based planner — PURE. Classifies the planned set (from the chunker)
// against the rows currently stored, into five buckets per table. No DB access:
// the caller fetches `existing` (write.ts#fetchExistingState) and materialises
// the result. Keeping it pure makes the diff fully unit-testable offline.

import type { PlannedChunk, PlannedDocument, PlannedEntity } from "./chunker";

interface ExistingDocument {
  id: string;
  payloadHash: string;
  embeddingModel: string;
}
interface ExistingChunk {
  id: string;
  documentId: string;
  embedHash: string;
}
export interface ExistingState {
  documents: ExistingDocument[];
  chunks: ExistingChunk[];
}

export interface IngestPlan {
  documents: {
    new: PlannedDocument[];
    changed: PlannedDocument[]; // payload_hash or embedding_model differs
    unchanged: PlannedDocument[];
    orphans: string[]; // doc ids stored but absent from the plan
  };
  chunks: {
    new: PlannedChunk[];
    reEmbed: PlannedChunk[]; // embed_hash differs → needs a fresh embedding
    unchanged: PlannedChunk[];
    orphans: string[]; // chunk ids stored but absent from the plan
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

export function planIngest(
  planned: PlannedEntity[],
  existing: ExistingState,
  embeddingModel: string,
): IngestPlan {
  const plannedDocs = planned.map((p) => p.document);
  const plannedChunks = planned.flatMap((p) => p.chunks);
  const plannedDocIds = new Set(plannedDocs.map((d) => d.id));
  const plannedChunkIds = new Set(plannedChunks.map((c) => c.id));
  const docMap = new Map(existing.documents.map((d) => [d.id, d]));
  const chunkMap = new Map(existing.chunks.map((c) => [c.id, c]));

  const documents: IngestPlan["documents"] = {
    new: [],
    changed: [],
    unchanged: [],
    orphans: [],
  };
  for (const d of plannedDocs) {
    const ex = docMap.get(d.id);
    if (!ex) documents.new.push(d);
    else if (
      ex.payloadHash !== d.payloadHash ||
      ex.embeddingModel !== embeddingModel
    )
      documents.changed.push(d);
    else documents.unchanged.push(d);
  }
  documents.orphans = existing.documents
    .filter((d) => !plannedDocIds.has(d.id))
    .map((d) => d.id);

  const chunks: IngestPlan["chunks"] = {
    new: [],
    reEmbed: [],
    unchanged: [],
    orphans: [],
  };
  for (const c of plannedChunks) {
    const ex = chunkMap.get(c.id);
    if (!ex) chunks.new.push(c);
    else if (ex.embedHash !== c.embedHash) chunks.reEmbed.push(c);
    else chunks.unchanged.push(c);
  }
  // Only list orphan chunks whose parent doc is *staying*: an orphan document
  // CASCADE-deletes its own chunks, so re-listing those would be redundant.
  const orphanDocIds = new Set(documents.orphans);
  chunks.orphans = existing.chunks
    .filter(
      (c) => !plannedChunkIds.has(c.id) && !orphanDocIds.has(c.documentId),
    )
    .map((c) => c.id);

  return { documents, chunks };
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

// A scoped run (--limit / --content-dir) diffs a SUBSET of content against the
// whole store, so every out-of-scope row looks orphaned. Pruning then would
// wipe the rest of the catalogue — so a scoped run never prunes. Returns a new
// plan with the orphan lists cleared (pure).
export function withoutPruning(plan: IngestPlan): IngestPlan {
  return {
    documents: { ...plan.documents, orphans: [] },
    chunks: { ...plan.chunks, orphans: [] },
  };
}
