import { sql } from "drizzle-orm";
import { SIMILARITY_THRESHOLD, weightForKind } from "./config";
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
  form_id: string | null;
  chunk_kind: string;
  chunk_text: string;
  payload: Record<string, unknown> | null;
  sim: number;
}

// Additive boost on top of cosine similarity. Not a true pin — it dominates
// only because every service-kind weight in DOC_KIND_WEIGHTS is 1.0. If you
// raise a service kind above (1 + 1.0), pinned chunks lose primacy. Keep
// PINNED_BOOST > max kind weight if you change weights.
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
  const rankedQuery = db.execute<V2Row>(sql`
    WITH ranked AS (
      SELECT
        c.id          AS chunk_id,
        d.id          AS document_id,
        d.kind        AS doc_kind,
        d.title       AS title,
        d.url         AS url,
        d.source_url  AS source_url,
        d.metadata->>'formId' AS form_id,
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
    SELECT chunk_id, document_id, doc_kind, title, url, source_url,
           form_id, chunk_kind, chunk_text, payload, sim
    FROM ranked
    WHERE rank <= 2 AND sim > ${SIMILARITY_THRESHOLD}
    ORDER BY sim DESC
    LIMIT ${fetchLimit}
  `);

  const pinnedQuery = boostSlug
    ? db.execute<V2Row>(sql`
        SELECT
          c.id          AS chunk_id,
          d.id          AS document_id,
          d.kind        AS doc_kind,
          d.title       AS title,
          d.url         AS url,
          d.source_url  AS source_url,
          d.metadata->>'formId' AS form_id,
          c.kind        AS chunk_kind,
          c.text        AS chunk_text,
          c.payload     AS payload,
          1 - (c.embedding <=> ${literal}::vector) AS sim
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE (d.slug = ${boostSlug} OR d.metadata->>'formId' = ${boostSlug})
          AND d.metadata->>'status' IS DISTINCT FROM 'draft'
          AND d.metadata->>'status' IS DISTINCT FROM 'preview'
        ORDER BY sim DESC
        LIMIT ${PINNED_LIMIT}
      `)
    : Promise.resolve({ rows: [] as V2Row[] });

  const [result, pinnedRes] = await Promise.all([rankedQuery, pinnedQuery]);
  const pinned: V2Row[] = pinnedRes.rows.map((r) => ({
    ...r,
    sim: Number(r.sim) + PINNED_BOOST,
  }));

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
    ...(r.form_id ? { formId: r.form_id } : {}),
  }));

  return { contexts, sources };
}

type ChunkKind =
  | "section"
  | "contact"
  | "minister"
  | "head"
  | "body"
  | "intent"
  | "name";

function friendlySection(r: V2Row): string | undefined {
  const payload = r.payload as { heading?: string; label?: string } | null;
  const kind = r.chunk_kind as ChunkKind;
  switch (kind) {
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
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
