// Tuned by eval/sweep.ts on 2026-06-08 against the live sandbox vector DB,
// after adding hard out-of-corpus cases to golden.json (48 entries: direct,
// followup, ambig, and `none` queries a real/WhatsApp user might ask that the
// corpus can't answer — passport, driver's licence, tax, firearm, etc.). With
// those cases in the set the composite climbs with the cutoff (score 0.30 →
// 0.732, 0.45 → 0.807), so SCORE_THRESHOLD moves 0.30 → 0.45: it rejects most
// out-of-corpus queries that leaked at 0.30 (tax, firearm, company reg) without
// the recall loss 0.50 starts to cause (e.g. ambiguous "register"). The SQL
// floor is flat across the grid, so SIMILARITY_THRESHOLD stays 0.25.
//
// Caveat: a threshold is not a silver bullet. A few out-of-corpus queries still
// leak because they're HIGH-similarity false matches to wrong-but-plausible
// services (passport↔certificates, driver's licence↔conductor licence,
// visa↔financial assistance). Those need content coverage or a relevance gate,
// not a higher number — tracked separately.

// Minimum raw cosine similarity for the SQL probe in retrieve.ts.
export const SIMILARITY_THRESHOLD = 0.25;

// Minimum weighted score (sim × kind weight) for the chat-side cutoff
// in retrieval.ts after reranking.
export const SCORE_THRESHOLD = 0.45;

// How many reranked chunks to consider before applying SCORE_THRESHOLD.
export const TOP_K = 10;

// Cap on chunks delivered to the LLM in a single turn.
export const MAX_SOURCES = 6;

// Hard ceiling on context block characters.
export const MAX_CONTEXT_CHARS = 6000;

export const DOC_KIND_WEIGHTS: Record<string, number> = {
  service: 1.0,
  form: 1.0,
  news: 0.7,
};

export function weightForKind(kind: string): number {
  return DOC_KIND_WEIGHTS[kind] ?? 1.0;
}
