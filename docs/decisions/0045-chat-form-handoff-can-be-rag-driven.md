# 0045 — Chat form handoff can be RAG-driven, but RAG never collects inline

**Date:** 2026-06-09
**Status:** Accepted

## Context

Issue [#921](https://github.com/govtech-bb/gov-bb/issues/921) reported that
asking the chat about a conductor's licence produced *"I don't have information
about conductor licences in the retrieved context"* and pointed the user at a
manual site search — instead of linking them to the application form, which
exists, is published (`apply-for-conductor-licence`), and requires a document
upload (a Police Certificate of Character).

The chat detects which form a turn is about with `matchFormsFromText`
(`form/detect.ts`): it tokenises the latest user text and requires **two**
overlapping meaningful tokens with a form's title before it pins that form. Once
a form is pinned, `resolveActiveForm` decides between **collect** (gather fields
inline) and **handoff** (hand the user a `${FORMS_URL}/forms/<slug>` link
because the form needs a file upload, payment, or is otherwise unsafe to fill in
chat — see `needsHandoff`, [#965]/[#966]).

The matcher works for "conductor licence" (tokens `{conductor, licence}`), but a
single distinctive token isn't enough: "how do I become a conductor", "PSV
conductor", or the US spelling "conductor license" all score 1 and miss, so the
turn falls through to a plain RAG answer. We confirmed the form itself was
healthy on the live sandbox (published, parses against the chat's
`serviceContractSchema`, `hasFile` true) — the gap was purely *which form the
turn resolved to*.

We considered lowering the matcher's threshold (e.g. matching on a single
globally-unique title token). We rejected that in favour of using the signal we
already compute every turn — semantic RAG retrieval — which finds the right
service regardless of wording.

## Decision

The chat resolves a form from **two independent signals**:

1. **Title-token matching** (`matchFormsFromText`) — the primary path, and the
   **only** path that may lead to inline field **collection**.
2. **RAG retrieval** — a fallback in `run-turn`. When the matcher pins nothing
   (`resolution.kind === "none"` *and* `session.slug` is null), the top
   retrieved source's slug (`topHandoffCandidateSlug`, `retrieval.ts`) is
   resolved against the published-form index, and **only a `handoff` outcome is
   honoured**. A retrieved service that maps to a *collectable* form is left as a
   normal informational answer.

The governing principle: **RAG-derived form detection may only hand off a
forms-app link; it must never auto-start inline collection.** Collection commits
the chat to gathering structured field values turn-after-turn, so it must stay
behind the explicit, higher-confidence matcher signal. Handing over a link is a
low-commitment, easily-ignored action, so the fuzzier RAG signal is allowed to
trigger it.

The RAG fallback reuses the same `SCORE_THRESHOLD` as citation pills (so it only
fires on a strong match), is gated on the published-form index (so info-only
services don't trigger a doomed form-definition fetch), and parks the form in
`session.handedOffSlug` exactly like the matcher-driven handoff so the user
isn't re-handed the same link every turn.

## Consequences

- **Document-upload (and payment) forms are reachable from natural phrasings.**
  Any service RAG can surface that maps to a handoff-required form now produces
  the link, not just those whose wording overlaps the form title.
- **The "never collect from RAG" rule is load-bearing.** A future change that
  lets the RAG fallback return a `collect` resolution would overturn this
  decision — it would make inline collection start non-deterministically on
  fuzzy semantic matches. If inline collection ever needs a second trigger,
  revisit this record rather than quietly widening the fallback.
- **The fallback depends on retrieval coverage.** A form is only reachable this
  way if its service content is ingested and clears the grounding threshold; an
  un-ingested service still misses. Form reachability is therefore a function of
  both the form index *and* the RAG corpus.
- **Slug alignment is assumed.** The fallback derives the form slug from the
  retrieved document id (`service-<slug>`), which works because the service
  content slug equals the form's `formId`. Where they diverge, the fallback
  won't fire — a content/form-id mismatch is the place to look.
