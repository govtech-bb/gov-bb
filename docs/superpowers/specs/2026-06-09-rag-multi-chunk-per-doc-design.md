# Chat RAG keeps ≥2 chunks per document (#968)

Fix the chatbot's retrieval so multi-part questions ("How much is a birth
certificate AND how long does it take?") can surface multiple sibling chunks
from the winning document, rather than losing every section except the
top-scoring one.

## Problem

The current SQL in `apps/chat/src/lib/rag/retrieve.ts` retains only the
single highest-similarity chunk per document via `WHERE rank = 1` over a
`ROW_NUMBER() OVER (PARTITION BY d.id ORDER BY sim DESC)` window. Live
verification (per #968):

> "How much is a birth certificate and how long does it take?" → returns
> the Cost section (sim 0.730) but **not** the timeline section.

The two pieces of information live in different chunks of the same document.
The LLM never sees the Timeline chunk, so its answer is incomplete.

There is also an internal asymmetry that helped surface this: the
`pinnedQuery` branch (used when chat already knows the target slug from
context) already returns up to **2 chunks per doc** via `PINNED_LIMIT = 2`.
Only the `rankedQuery` branch — the one we actually rely on for discovery —
is stingy.

## Decisions (locked during brainstorming)

| Dimension | Decision | Rejected alternatives |
|---|---|---|
| Retrieval shape | Top-K-per-doc via SQL — change `WHERE rank = 1` to `WHERE rank <= 2` in the existing window-function-ranked CTE | Backfill sibling sections in JS (needs new sibling-ordering model, extra SQL round-trip); hybrid top-2 + sibling backfill (premature without eval pressure) |
| Chunks per doc | **2** (matches the existing `PINNED_LIMIT = 2` convention in the same file) | 3+ (loses doc diversity at `TOP_K = 10`); configurable constant (YAGNI — two inline `2`s is fine until a third use site appears) |
| Constants | None change. `TOP_K = 10`, `MAX_SOURCES = 6`, `fetchLimit = topK * 3`, `SIMILARITY_THRESHOLD = 0.45` all stay | Lower `MAX_SOURCES` (issue's literal suggestion, but unneeded — citation flow already dedupes by `url + section`); raise `TOP_K` (LLM context bloat); bump `fetchLimit` (no headroom problem) |
| Validation | Retrieval sweep improves on the bug case + behavioral eval doesn't regress (≥ 54/59 baseline). The bug query must be in `golden.json` — add it if missing | Retrieval sweep only (hides behavioral regressions); single-case smoke only (no regression coverage); behavioral eval only (LLM-judge noise; doesn't directly measure the retrieval change) |

## Design

### 1. The SQL change — `apps/chat/src/lib/rag/retrieve.ts`

The entire mechanical change is one word in one file, in the SQL string
literal that builds the `ranked` CTE:

```diff
       FROM chunks c
       JOIN documents d ON c.document_id = d.id
       WHERE d.metadata->>'status' IS DISTINCT FROM 'draft'
     )
     SELECT chunk_id, document_id, doc_kind, title, url, source_url,
            chunk_kind, chunk_text, payload, sim
     FROM ranked
-    WHERE rank = 1 AND sim > ${SIMILARITY_THRESHOLD}
+    WHERE rank <= 2 AND sim > ${SIMILARITY_THRESHOLD}
     ORDER BY sim DESC
     LIMIT ${fetchLimit}
```

Why this works without further code changes:

- The `ROW_NUMBER() OVER (PARTITION BY d.id ORDER BY sim DESC) AS rank`
  was added in commit `996f9f53` precisely to enable per-doc ranking.
  Relaxing `rank = 1` to `rank <= 2` is what the infrastructure was always
  set up for.
- `fetchLimit = topK * 3` (= 30) candidate rows leaves ≥15 unique docs of
  headroom even when each doc contributes 2 chunks. No tuning needed.
- The post-fetch `Set<chunk_id>` dedup on line 99-105 handles the rare
  overlap between `pinnedQuery` (up to 2 chunks for a pinned slug) and
  `rankedQuery` (now also up to 2 chunks for ranked hits) cleanly.
- Docs with only one chunk above `SIMILARITY_THRESHOLD` return just one row
  (rank=2 row doesn't exist for them); no special-case logic.
- `weightForKind()` multiplier on line 110 is applied AFTER fetch, so the
  newly-included rank-2 chunks go through the same kind-weight pipeline as
  the rank-1 chunks. No re-ranking semantics added.

### 2. Golden-set coverage — `apps/chat/eval/golden.json`

The bug case must be in the retrieval golden set so the eval sweep proves
the fix. Before any code change, grep `golden.json` for the birth-cert
cost+timeline query (or a near paraphrase):

```bash
grep -i "how much.*birth.*how long\|how long.*birth.*how much\|cost.*timeline\|timeline.*cost" apps/chat/eval/golden.json
```

If a matching case exists, no action needed. If not, add one entry whose
`expectedSources` includes both the Cost and Timeline sections of
`get-birth-certificate`. Use existing entries as the structural template.

### 3. Eval validation — before-and-after sweep + behavioral run

```bash
cd apps/chat

# Baseline (BEFORE the SQL change)
pnpm eval:sweep
cp eval/results.json eval/results.before.json    # local snapshot, do not commit
pnpm eval:responses
cp eval/responses/results.json eval/responses/results.before.json   # local snapshot

# Make the SQL change

# Post-change measurement
pnpm eval:sweep
pnpm eval:responses

# Compare. The committed eval/results.json and eval/responses/results.json
# now reflect the new behavior (and become part of the PR diff per the
# repo's convention from #974 / #1004).
```

**Pass criteria:**

1. **Retrieval sweep** — the bug case ("How much...and how long") must surface
   both the Cost section and the Timeline section in its top-K results.
   Overall recall/precision metrics ≥ pre-change baseline (any regression on a
   golden case requires investigation before merging).
2. **Behavioral eval** — pass count stays ≥ 54/59 baseline (#1004's committed
   scorecard). If a single case flips, re-run once; LLM-judge variance can
   produce false single-case flips. Two consecutive runs showing the same
   regression = real regression, halt and investigate.

The committed-eval-results convention from #974 means the PR diff includes
the empirical improvement as visible evidence — not just the code change.

## Alternatives considered

**Approach B — backfill sibling sections in JS after fetch.** After retrieving
top-1-per-doc rows, for each retained row execute a second SQL query
fetching its adjacent (by document order) chunks. *Rejected:* the `chunks`
table doesn't currently expose an explicit `chunk_index` / ordering field in
`V2Row`. Adding one would require a schema look, possibly a migration, plus
the new SQL round-trip — more PR scope than the bug needs. If post-launch
eval reveals cases where similarity-based top-2 misses the truly adjacent
sibling, this can land as a v1.1.

**Approach C — hybrid: top-2 by similarity, plus sibling backfill for
section-kind chunks.** Combines A and B. *Rejected:* premature without
eval pressure showing A is insufficient. Build A, measure, then add B
incrementally if needed.

**Issue's "lower MAX_SOURCES to compensate."** *Rejected:* the citation
assembly in `retrieval.ts:83` already dedupes by `s.url + (s.section ?? "")`.
When two chunks from the same doc have different sections (the exact
bug case — "Cost" vs "Timeline"), the existing logic shows them as two
distinct citations — which is the *correct* user-facing answer. Lowering
`MAX_SOURCES` would just hide useful sources.

**Raise `TOP_K` from 10 to 12.** *Rejected:* TOP_K shapes how many chunks
the LLM sees per turn. Adding 20% more context per chat turn costs real
tokens for a benefit that the existing 10-chunk budget already absorbs
(after the fix, 10 chunks come from ~5-7 unique docs — depth-per-doc grows
without losing diversity).

**Extract `MAX_CHUNKS_PER_DOC` constant in `rag-config.ts`.** *Rejected:* two
inline `2`s in `retrieve.ts` (the existing `PINNED_LIMIT` and the new
`rank <= 2`) is fine until a third use site appears.

## Out of scope / non-goals

| Not in this PR | When to revisit |
|---|---|
| Sibling-by-document-order retrieval (Approach B) | If eval sweep shows similarity-based top-2 systematically misses adjacent sections that should have been cited. |
| Lowering or raising any of `TOP_K`, `MAX_SOURCES`, `fetchLimit`, `SIMILARITY_THRESHOLD` | Treat each as its own tuning decision driven by eval data. Bundling tunings with this fix would conflate the change set. |
| Extracting `MAX_CHUNKS_PER_DOC` as a named constant | Add when a third use site needs it. |
| Refactoring `retrieve.ts` more broadly (the file is currently 164 lines and well-bounded) | Not warranted by the change. |
| Query decomposition (splitting multi-part questions into sub-queries before retrieval) | Strictly more powerful than top-K-per-doc but materially more complex. Track separately if multi-question handling proves insufficient post-launch. |

## Workspace

Spec written on branch `fix/rag-multi-chunk-per-doc-968`, based on
`origin/sandbox`. Implementation plan to follow under `docs/plans/` (not
committed per CLAUDE.md). Final PR opens against `sandbox`.

Closes #968.
