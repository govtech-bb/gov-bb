import { sql } from "drizzle-orm";
import { SIMILARITY_THRESHOLD, weightForKind } from "#/lib/chat/rag-config";
import type { RetrievedContext, Source } from "#/lib/chat/types";
import { getDb } from "#/lib/db";
import { embed } from "./embed";

export interface RetrieveResult {
  contexts: RetrievedContext[];
  sources: Source[];
}

interface V2Row extends Record<string, unknown> {
  chunk_id: string;
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

// When set, top-2 chunks from the matching service doc are pinned to the
// front of the result so follow-up turns inside an active form ("what do I
// need?", "how much?") always see the form's own content even if the
// rewriter produced a query that scores low against those chunks.
const PINNED_BOOST = 1.0;
const PINNED_LIMIT = 2;

export async function search(
  query: string,
  topK: number,
  boostSlug?: string,
): Promise<RetrieveResult> {
  const vector = await embed(query);
  const db = await getDb();

  const literal = JSON.stringify(vector);
  const fetchLimit = topK * 3;
  const result = await db.execute<V2Row>(sql`
    WITH ranked AS (
      SELECT
        c.id          AS chunk_id,
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
    SELECT chunk_id, document_id, doc_kind, title, url, source_url,
           chunk_kind, chunk_text, payload, sim
    FROM ranked
    WHERE rank = 1 AND sim > ${SIMILARITY_THRESHOLD}
    ORDER BY sim DESC
    LIMIT ${fetchLimit}
  `);

  let pinned: V2Row[] = [];
  if (boostSlug) {
    const pinnedRes = await db.execute<V2Row>(sql`
      SELECT
        c.id          AS chunk_id,
        d.id          AS document_id,
        d.kind        AS doc_kind,
        d.title       AS title,
        d.url         AS url,
        d.source_url  AS source_url,
        c.kind        AS chunk_kind,
        c.text        AS chunk_text,
        c.payload     AS payload,
        1 - (c.embedding <=> ${literal}::vector) AS sim
      FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE d.slug = ${boostSlug}
        AND d.metadata->>'status' IS DISTINCT FROM 'draft'
      ORDER BY sim DESC
      LIMIT ${PINNED_LIMIT}
    `);
    pinned = pinnedRes.rows.map((r) => ({
      ...r,
      sim: Number(r.sim) + PINNED_BOOST,
    }));
  }

  const seen = new Set<string>();
  const merged: V2Row[] = [];
  for (const r of [...pinned, ...result.rows]) {
    if (seen.has(r.chunk_id)) continue;
    seen.add(r.chunk_id);
    merged.push(r);
  }

  const rows = merged
    .map((r) => ({
      ...r,
      sim: Number(r.sim) * weightForKind(r.doc_kind),
    }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK);

  const contexts: RetrievedContext[] = rows.map((r) => ({
    title: r.title,
    section: friendlySection(r),
    text: r.chunk_text,
  }));

  const sources: Source[] = rows.map((r) => ({
    id: r.document_id,
    url: r.url,
    title: r.title,
    section: friendlySection(r),
    score: Number(r.sim),
    excerpt: r.chunk_text.slice(0, 160),
  }));

  return { contexts, sources };
}

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
