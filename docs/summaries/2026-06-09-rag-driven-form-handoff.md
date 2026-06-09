# Chat hands off document-upload forms from RAG, not just the title matcher (#921)

## Context

A chatbox QA test
([#921](https://github.com/govtech-bb/gov-bb/issues/921)) found that asking
about a conductor's licence returned *"I don't have information about conductor
licences in the retrieved context"* and told the user to search the site
manually — instead of linking them to the application form (which requires a
Police Certificate of Character upload). Resolved on
`chat/rag-driven-form-handoff` (targets `sandbox`).

## What we did

- Added a pure `topHandoffCandidateSlug(sources, excludeSlug)` to
  `apps/chat/src/lib/chat/retrieval.ts`: derives a form slug from the single
  top-ranked retrieved source (`service-<slug>` document id), gated on the
  citation `SCORE_THRESHOLD`, the `service-` prefix, a non-empty slug, and an
  exclusion for the already-handed-off form.
- Wired a RAG-driven handoff fallback into `run-turn.ts`: when the title matcher
  pins nothing (`resolution.kind === "none" && !session.slug`), resolve the
  candidate against the published-form index and, **only** if it resolves to a
  `handoff`, hand the user the forms-app link. Parks `session.handedOffSlug`
  like the matcher path so the link isn't repeated every turn.
- Gated the fallback on `getFormSlugs()` (re-exported from `form/index.ts`) so
  info-only services don't trigger a doomed form-definition fetch + 404 warning.
- Tests: new `retrieval.test.ts` (threshold incl. boundary, non-service ids,
  empty slug, top-only semantics, exclusion); widened the `test` script glob.
- Recorded the principle in `docs/decisions/0045-chat-form-handoff-can-be-rag-driven.md`.

## Why we did it that way

- **Diagnosis ruled out the obvious culprits first.** Against the live sandbox
  we confirmed the conductor recipe is published, its contract parses against
  the chat's `serviceContractSchema`, and `hasFile` is true — so `needsHandoff`
  and the whole handoff machinery were healthy. Simulating `matchFormsFromText`
  against the live form index showed the real gap: the matcher needs **two**
  overlapping title tokens, so "conductor licence" matches but "how do I become
  a conductor", "PSV conductor", and the US spelling "conductor license" all
  score 1 and miss, falling through to a plain RAG answer.
- **Chose RAG over loosening the matcher.** The first proposal was a
  distinctive-single-token rule in the matcher (match on a globally-unique title
  token like "conductor"). We dropped it in favour of driving the handoff from
  semantic retrieval, which already runs every turn and finds the right service
  regardless of wording — no new matching heuristic to tune against false
  positives.
- **Scoped strictly to `handoff`, never `collect`.** Inline field collection
  commits the chat to multi-turn field-gathering, so it stays behind the
  explicit matcher. The RAG fallback only ever hands over a link — a
  low-commitment action — so it's safe to trigger on the fuzzier signal. See
  ADR 0045.
- **Top-source-only, reusing the citation bar.** The helper considers only
  `sources[0]` (the turn's actual topic) rather than scanning for any
  upload-form lower in the list, and reuses `SCORE_THRESHOLD` so it fires on the
  same strength as a citation pill.
- **`!session.slug` gate.** A code-review pass flagged that `resolution ===
  "none"` can also arise when a *pinned* form fails to resolve (transient
  form-API blip). Gating on `!session.slug` stops a blip from silently
  redirecting the user to a different RAG-derived form, and guarantees the form
  index is warm-cached (the matcher block runs exactly when `!session.slug`).

## Follow-up

- The fallback depends on the service being ingested and clearing the grounding
  threshold; an un-ingested service still misses. Behaviour is verified on the
  PR's Amplify preview (live RAG + Bedrock), not locally.
- Slug derivation assumes the service content slug equals the form's `formId`
  (true for conductor). Where they diverge the fallback won't fire — out of
  scope here; would need form-id carried in the ingest metadata.
