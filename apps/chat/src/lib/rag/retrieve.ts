import { sql } from "drizzle-orm";
import { getServerEnv } from "#/config/env";
import { withDbAuthRetry, type Database } from "#/lib/db";
import { embed } from "./embed";
import { rewriteLandingHost } from "./landing-host";
import { MAX_CHUNKS_PER_DOC, SIMILARITY_THRESHOLD, TOP_K } from "./config";
import type { RetrievedContext, RetrieveResponse, Source } from "./types";

// RAG retrieval: embed the (rewritten) question, probe the pgvector store for the
// nearest chunks, and rerank them into grounded sources. Caps chunks per document
// and drops anything below the similarity threshold so weak matches don't pad the
// context the model answers from.

// One reranked chunk row out of the SQL probe.
export interface RetrieveRow extends Record<string, unknown> {
  document_id: string;
  doc_kind: string;
  title: string;
  url: string;
  source_url: string | null;
  form_id: string | null;
  has_start_page: string | null;
  chunk_kind: string;
  chunk_text: string;
  payload: Record<string, unknown> | null;
  sim: number | string;
}

// A human-friendly section label for a chunk. There are two chunk kinds: a
// "section" carries its markdown heading; an "intent" chunk is the synthetic
// title+description question and has no section label.
export function friendlySection(
  row: Pick<RetrieveRow, "chunk_kind" | "payload">,
): string | undefined {
  if (row.chunk_kind === "section") {
    const p = row.payload as { heading?: string } | null;
    return p?.heading ?? undefined;
  }
  return undefined;
}

// Pure row → response shaping. Exported so it's unit-testable without a DB:
// coerce sim to a number, sort, cap at topK, map to contexts + sources, and
// rewrite citation hosts to the viewer's landing origin.
export function rowsToResult(
  rows: RetrieveRow[],
  landingUrl: string,
  topK = TOP_K,
): RetrieveResponse {
  const ranked = rows
    .map((r) => ({ ...r, sim: Number(r.sim) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK);

  const contexts: RetrievedContext[] = ranked.map((r) => ({
    title: r.title,
    section: friendlySection(r),
    text: r.chunk_text,
  }));

  const sources: Source[] = ranked.map((r) => ({
    id: r.document_id,
    url: rewriteLandingHost(r.url, landingUrl),
    title: r.title,
    section: friendlySection(r),
    score: r.sim,
    excerpt: r.chunk_text.slice(0, 160),
    ...(r.form_id ? { formId: r.form_id } : {}),
    // metadata->>'hasStartPage' comes back as the text "true" (jsonb boolean).
    ...(r.has_start_page === "true" ? { hasStartPage: true } : {}),
  }));

  return { contexts, sources };
}

// Cosine-rank chunks against an already-embedded query vector: keep the best
// MAX_CHUNKS_PER_DOC per document above the similarity floor, gated to
// non-draft/preview content, ordered by similarity. Split out from `search` so
// it's exercisable against a real DB without a live embed call (and with an
// injected db handle). Form-pinning / boostSlug belongs to the in-chat form
// features and isn't done here.
export async function searchByVector(
  vector: number[],
  topK = TOP_K,
  db?: Database,
): Promise<RetrieveResponse> {
  const literal = JSON.stringify(vector);
  const runQuery = (database: Database) =>
    database.execute<RetrieveRow>(sql`
    WITH ranked AS (
      SELECT
        d.id          AS document_id,
        d.kind        AS doc_kind,
        d.title       AS title,
        d.url         AS url,
        d.source_url  AS source_url,
        d.metadata->>'formId' AS form_id,
        d.metadata->>'hasStartPage' AS has_start_page,
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
        AND d.metadata->>'status' IS DISTINCT FROM 'preview'
    )
    SELECT document_id, doc_kind, title, url, source_url,
           form_id, has_start_page, chunk_kind, chunk_text, payload, sim
    FROM ranked
    WHERE rank <= ${MAX_CHUNKS_PER_DOC} AND sim > ${SIMILARITY_THRESHOLD}
    ORDER BY sim DESC
    LIMIT ${topK}
  `);
  // Tests inject a `db` directly — skip the retry wrapper so the injected handle
  // is honored verbatim. Production callers go through withDbAuthRetry so a
  // mid-life RDS password rotation triggers exactly one re-resolve + retry.
  const res = db ? await runQuery(db) : await withDbAuthRetry(runQuery);

  return rowsToResult(res.rows, getServerEnv().LANDING_URL, topK);
}

// Embed the query, then retrieve. The request path's entry point.
export async function search(
  query: string,
  topK = TOP_K,
): Promise<RetrieveResponse> {
  return searchByVector(await embed(query), topK);
}
