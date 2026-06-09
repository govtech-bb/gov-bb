// Embed + upsert. Calls Bedrock only for chunks in {new, reEmbed}.
// Streams progress to stdout so long ingests have a heartbeat.

import { sql } from "drizzle-orm";
import { getDb, schema } from "#/lib/db";
import { embedWithRetry } from "#/lib/rag/embed";
import type { PlannedChunk, PlannedDocument } from "./chunker";
import type { IngestPlan } from "./plan";

export interface ProgressEvent {
  phase: "documents" | "chunks";
  done: number;
  total: number;
  /** Last chunk's document for context — e.g. "service-renew-passport". */
  lastId?: string;
}

export type ProgressFn = (e: ProgressEvent) => void;

async function upsertDocuments(
  docs: PlannedDocument[],
  embeddingModel: string,
  onProgress?: ProgressFn,
): Promise<void> {
  if (docs.length === 0) return;
  const db = await getDb();
  let done = 0;
  for (const d of docs) {
    await db
      .insert(schema.documents)
      .values({
        id: d.id,
        kind: d.kind,
        slug: d.slug,
        title: d.title,
        url: d.url,
        sourceUrl: d.sourceUrl,
        metadata: d.metadata,
        payloadHash: d.payloadHash,
        embeddingModel,
      })
      .onConflictDoUpdate({
        target: schema.documents.id,
        set: {
          kind: d.kind,
          slug: d.slug,
          title: d.title,
          url: d.url,
          sourceUrl: d.sourceUrl,
          metadata: d.metadata,
          payloadHash: d.payloadHash,
          embeddingModel,
          updatedAt: sql`now()`,
        },
      });
    done++;
    onProgress?.({
      phase: "documents",
      done,
      total: docs.length,
      lastId: d.id,
    });
  }
}

async function embedAndUpsertChunks(
  chunks: PlannedChunk[],
  onProgress?: ProgressFn,
): Promise<void> {
  if (chunks.length === 0) return;
  const db = await getDb();
  let done = 0;
  for (const c of chunks) {
    const vector = await embedWithRetry(c.text);
    await db
      .insert(schema.chunks)
      .values({
        id: c.id,
        documentId: c.documentId,
        kind: c.kind,
        chunkIndex: c.chunkIndex,
        text: c.text,
        payload: c.payload,
        embedHash: c.embedHash,
        embedding: vector,
      })
      .onConflictDoUpdate({
        target: schema.chunks.id,
        set: {
          documentId: c.documentId,
          kind: c.kind,
          chunkIndex: c.chunkIndex,
          text: c.text,
          payload: c.payload,
          embedHash: c.embedHash,
          embedding: vector,
          updatedAt: sql`now()`,
        },
      });
    done++;
    onProgress?.({ phase: "chunks", done, total: chunks.length, lastId: c.id });
  }
}

export async function applyPlan(
  plan: IngestPlan,
  embeddingModel: string,
  onProgress?: ProgressFn,
): Promise<void> {
  // Order matters: upsert docs first so chunk FKs resolve.
  await upsertDocuments(
    [...plan.documents.new, ...plan.documents.changed],
    embeddingModel,
    onProgress,
  );
  await embedAndUpsertChunks(
    [...plan.chunks.new, ...plan.chunks.reEmbed],
    onProgress,
  );
}
