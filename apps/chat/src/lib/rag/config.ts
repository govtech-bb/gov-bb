// Retrieval tuning. Thresholds were tuned by an eval sweep against the live
// sandbox vector DB (2026-06-08). There's a single doc kind ("service"), so
// there is no per-kind weighting.

// Minimum raw cosine similarity for the SQL probe in retrieve.ts.
export const SIMILARITY_THRESHOLD = 0.25;

// How many reranked chunks the retrieve service returns.
export const TOP_K = 10;

// Max chunks kept per document in the SQL probe (the per-doc rank cap). Bounds
// how much one service can dominate the result set — but set too low it starves
// a focused single-service query of depth. At 2, a question about one
// many-sectioned service (e.g. "death certificate cost") could miss the exact
// section (cost ranked ~3rd within the doc) and force an honest abstention. 4
// gives a dominant service room for its top few sections while still leaving
// slots (TOP_K=10) for other services.
export const MAX_CHUNKS_PER_DOC = 4;

// Used by the grounding stage, not the SQL probe above:
// minimum score to keep a source after retrieval, max sources delivered to the
// LLM, and the hard character ceiling on the assembled context block.
export const SCORE_THRESHOLD = 0.45;
export const MAX_SOURCES = 6;
export const MAX_CONTEXT_CHARS = 6000;
