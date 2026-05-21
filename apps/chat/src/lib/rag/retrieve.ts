import { sql } from "drizzle-orm";
import type { RetrievedContext, Source } from "#/lib/chat/types";
import { getDb } from "#/lib/db";
import { embed } from "./embed";

export interface RetrieveResult {
  contexts: RetrievedContext[];
  sources: Source[];
}

// Cosine threshold. Tune per embedding model. Filters in SQL so the LLM
// never sees irrelevant chunks.
const SIMILARITY_THRESHOLD = 0.3;

// v2 schema (documents + chunks). Returns top chunk per document.
// Per chat retrieve path, chunks include doc-level metadata so chat can
// drive tool selection (e.g. form CTAs) without a second query.
interface V2Row extends Record<string, unknown> {
  document_id: string;
  doc_kind: string;
  title: string;
  url: string;
  source_url: string | null;
  chunk_kind: string;
  chunk_text: string;
  payload: Record<string, unknown> | null;
  sim: number;
}

export async function search(
  query: string,
  topK: number,
): Promise<RetrieveResult> {
  const vector = await embed(query);
  const db = await getDb();

  const literal = JSON.stringify(vector);
  const result = await db.execute<V2Row>(sql`
    WITH ranked AS (
      SELECT
        d.id          AS document_id,
        d.kind        AS doc_kind,
        d.title       AS title,
        d.url         AS url,
        d.source_url  AS source_url,
        c.kind        AS chunk_kind,
        c.text        AS chunk_text,
        c.payload     AS payload,
        1 - (c.embedding <=> ${literal}::vector) AS sim,
        ROW_NUMBER() OVER (
          PARTITION BY d.id
          ORDER BY 1 - (c.embedding <=> ${literal}::vector) DESC
        ) AS rank
      FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE d.metadata->>'status' IS DISTINCT FROM 'draft'
    )
    SELECT document_id, doc_kind, title, url, source_url,
           chunk_kind, chunk_text, payload, sim
    FROM ranked
    WHERE rank = 1 AND sim > ${SIMILARITY_THRESHOLD}
    ORDER BY sim DESC
    LIMIT ${topK}
  `);

  const rows = result.rows;
  const sourceMode: "alpha" | "legacy" = "alpha";

  const contexts: RetrievedContext[] = rows.map((r) => ({
    title: r.title,
    section: friendlySection(r),
    text: r.chunk_text,
    source: sourceMode,
  }));

  const sources: Source[] = rows.map((r) => ({
    id: r.document_id,
    url: r.url,
    title: r.title,
    section: friendlySection(r),
    score: Number(r.sim),
    excerpt: r.chunk_text.slice(0, 160),
    source: sourceMode,
    serviceSlug: undefined,
  }));

  return { contexts, sources };
}

// Turn the chunk-level kind/payload into a human-readable label for the UI
// pill. Section chunks expose their heading; contact chunks expose the
// channel label ("Telephone", "Email"); minister/head get their own labels;
// others are unlabelled.
function friendlySection(r: V2Row): string | undefined {
  const payload = r.payload as { heading?: string; label?: string } | null;
  switch (r.chunk_kind) {
    case "section":
      return payload?.heading ?? undefined;
    case "contact":
      return payload?.label ?? "Contact";
    case "minister":
      return "Minister";
    case "head":
      return "Head";
    case "body":
      return "About";
    case "intent":
    case "name":
      return undefined;
    default:
      return r.chunk_kind;
  }
}
