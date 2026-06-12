# Redirect-mail family disambiguation (#1296, take 2)

## Context

#1296 ("broad requests force users into a form without clarifying which one")
was closed earlier today by #1297, which added title-token *tie*
disambiguation. The user reported it still reproduced on the sandbox preview:
"redirect mail" / "i want to redirect mail" still dropped straight into
"Redirect my personal mail". This session reopened #1296 and actually fixed it.

## What we did

- Declared a curated `FORM_FAMILIES` (the `post-office-redirection` trio) +
  `familyMembers()` in `apps/chat/src/lib/chat/form/policy.ts`.
- Taught `matchFormCandidatesFromIndex` (`detect.ts`) to expand a lexical winner
  that belongs to a declared family to the **whole family** (winner first), when
  2+ members are in the surfaceable index. `routing.ts` was left untouched — the
  expanded candidate list flows through #1297's existing `ambiguousTitles` path.
- Added regression tests using the **real published titles** (the data #1297's
  fixtures lacked) in `detect.test.ts`, plus family-declaration guards in
  `policy.test.ts`.

## Why we did it that way

**Why #1297 didn't work.** Its tie logic assumed the three redirection variants
share `redirect`/`mail` tokens. The *live* titles don't: business is published
as "Post Office Redirection - Business" (no `redirect`, no `mail`; the tokenizer
doesn't stem `redirection`→`redirect`), and deceased is "Tell the Post Office
someone has died" (shares nothing). So "redirect mail" cleared `MIN_SCORE`
against **only** the individual form → one candidate → no tie → hard pin. #1297's
unit fixtures used synthetic titles that all carried the shared tokens, so CI
was green while live was broken. The new tests deliberately use the real titles.

**Why a curated family list, not a heuristic.** Two heuristics were considered
and rejected:
- *formId prefix* — the user killed this immediately: `youth-*` is ~12 unrelated
  programmes (summer camp, jobstart, …), a category not a family. A prefix can't
  distinguish that from the genuine `post-office-redirection-*` variants.
- *RAG semantic breadth (D)* — probing the live vector DB showed it clusters the
  family well for the two mail forms (individual 0.67, business 0.64 for
  "redirect mail") **but the deceased doc lands at 0.41, below the 0.45
  `SCORE_THRESHOLD`** for the exact reported phrasings. So pure-D could not
  honour the user's "include all three" requirement; only stronger wording
  ("…post office") pulls deceased over the line.

That left explicit curation as the only signal robust enough — the titles can't
provide it and the ids/embeddings can't be trusted to. The decided shape was
**hybrid, C-led**: curation guarantees the set today; RAG-breadth (D) is
deferred as a general net for *undeclared* families.

**Why expansion replaces (not merges with) the lexical set.** A family hit means
the request named the *service*, not a member, so the family IS the answer —
mixing in unrelated lexical rivals would just dilute a 3-item choice list capped
at 3. Gated on 2+ live members so a family with one approved form still pins
normally.

**MVP friction accepted.** Even a specific "redirect my personal mail" now shows
the 3-way choice, because the published titles can't reliably auto-pick the
in-family member. The fix for that is the title cleanup (below), which is a
data/recipe change, not matcher logic.

## Open questions / follow-ups

- **Title cleanup (fast-follow):** republish `post-office-redirection-business`
  and `-deceased` (new versions — recipes are immutable, ADR 0041) with titles
  that read consistently in the choice pills ("Redirect my business mail") and
  carry distinguishing tokens, so a later change can pin directly on specific
  phrasing. Also realigns the stale eval `golden.json`/`results.json`.
- **D general-net (phase 2):** RAG-breadth disambiguation for families not in
  `FORM_FAMILIES`; needs a tentative/revocable pin since the matcher runs before
  retrieval.

## What we almost got wrong

The first instinct was pure RAG-breadth (D) as the robust, title-independent
mechanism. The live-DB probe is what caught that it silently drops the deceased
variant for the very phrasings being fixed — a reminder to check the actual
retrieval scores before trusting "semantic search will cluster them."
