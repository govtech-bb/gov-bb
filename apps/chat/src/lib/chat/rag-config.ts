// Tuned by eval/sweep.ts on 2026-05-24 (post section-chunk ingest). Eval
// set: 60 queries (52 expected hits, 3 ambig, 4 off-topic / greeting).
// Winner: composite 0.927 (recall 1.0, MRR 0.991, P@1 0.981, ambig 0.833,
// FP 0.0). Off-topic queries fell below sim 0.20, so the lenient floor is
// safe. Service/MDA boosts dropped to 1.0 after section chunks made the
// rerank prior unnecessary; news kept at 0.7 to deprioritise news pages.

// Minimum raw cosine similarity for the SQL probe in retrieve.ts.
export const SIMILARITY_THRESHOLD = 0.25;

// Minimum weighted score (sim × kind weight) for the chat-side cutoff
// in retrieval.ts after reranking.
export const SCORE_THRESHOLD = 0.3;

// How many reranked chunks to consider before applying SCORE_THRESHOLD.
export const TOP_K = 10;

// Cap on chunks delivered to the LLM in a single turn.
export const MAX_SOURCES = 6;

// Hard ceiling on context block characters.
export const MAX_CONTEXT_CHARS = 6000;

export const DOC_KIND_WEIGHTS: Record<string, number> = {
  service: 1.0,
  ministry: 1.0,
  department: 1.0,
  "state-body": 1.0,
  form: 1.0,
  news: 0.7,
};

export function weightForKind(kind: string): number {
  return DOC_KIND_WEIGHTS[kind] ?? 1.0;
}
