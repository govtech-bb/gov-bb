# Chat corpus: Health & Emergency Services content — Implementation Session

**Date:** 2026-06-22
**Branch:** `worktree-health-emergency-corpus-1330` (merge target: `sandbox`)
**Issue:** #1330

## Context

The chatbot returned "I don't have information on that" for Health & Emergency
Services questions (StormReady, emergency shelters). The chat corpus lives in
`apps/landing/src/content/` and had no storm-readiness or emergency-shelter
content, so retrieval had nothing to surface.

The issue framed this as missing markdown that just needed writing. Orienting
the code corrected that framing: **StormReady and Find an Emergency Shelter are
not corpus pages — they are bespoke React routes** under
`apps/landing/src/routes/health-and-emergency-services/`, with content embedded
in TS/JSON data files (`stormready-checklist.ts`, `emergency-shelters.json`,
`guidance-data.ts`). The corpus (`loadContent` → vector DB) is a separate tree.
So the fix is hand-authored summary markdown that lives parallel to the real
routes, the same shape as the existing `get-disaster-relief-assistance.md`.

## What we did

- **`apps/landing/src/content/stormready.md`** — condensed household
  preparation guidance (water, food, documents, health, communication, shelter
  & tools, before-the-storm steps) plus key storm contacts. Sourced from the
  StormReady route's `landing-page.tsx` and `stormready-checklist.ts`.
- **`apps/landing/src/content/find-an-emergency-shelter.md`** — when shelters
  open, who they're for, how to find one, Go Bag essentials, shelter rules, and
  emergency numbers. Sourced from the shelter route's landing/guidance pages.
- **`apps/chat/eval/responses/cases.json`** — four `direct` eval cases
  (hurricane-prep + nearest-shelter, each standard + bajan dialect).

## Why we did it that way

**Concise, answer-shaped — not a verbatim dump.** The shelter guidance source
carries 27 district chairpersons, a full phone directory, and a 12-term
hurricane glossary. Those were deliberately excluded: the chat only needs to
answer the common questions and cite the page; over-stuffing dilutes the
embeddings. The cited page remains the source of truth for the long-tail detail.

**Flat top-level files with `category: health-and-emergency-services`.** This
matches the `get-disaster-relief-assistance.md` convention and makes
`canonicalLandingPath` (in `apps/chat/src/ingest/chunker.ts`) emit
`/health-and-emergency-services/{slug}` — exactly the live URLs — so citations
link correctly. Verified by running `loadContent` against the content dir: both
files parse with zero frontmatter warnings, are `public`, and resolve to the
real URLs.

**Eval keywords were tightened after code review.** Direct-case judging in
`run.ts` is `pass: citationHit || textHit` — a case passes if the right page is
cited OR the reply contains a `replyIncludes` keyword. The first cut used the
topic words `"hurricane"` / `"shelter"`, which any on-topic reply emits — and
critically, `get-disaster-relief-assistance.md` also discusses hurricanes and
shelter, so a reply citing the *wrong* page would still pass on the keyword.
Tightened to page-distinctive phrases (`"hurricane season"`,
`"emergency shelter"`) so the `textHit` fallback is far less likely to mask a
retrieval miss. The OR-logic itself is shared framework behaviour across all
direct cases and was left untouched (out of scope for a content change).

## Verification

- `loadContent` against `apps/landing/src/content` → both new entries parse,
  zero warnings, correct canonical URLs, `visibility: public`.
- `nx run-many -t build --exclude=landing,cms` → 13 projects built.
- `nx run landing:test` → 155 pass (includes content registry frontmatter
  validation); `nx run-many -t test -p content chat` (chat) → 151 pass, 0 fail.
- **Deferred to sandbox (needs `DATABASE_URL` + AWS Bedrock):** `pnpm ingest`
  and `pnpm eval:responses`, plus live-chat manual checks of the issue's
  questions — confirmed manually after merge, as agreed.

## Notes

- **No new ADR.** The "corpus summaries parallel to code-driven routes" pattern
  is debt under discussion (#1509), not a blessed convention.
- **Follow-ups filed:** #1509 (long-term drift prevention between corpus and
  code-driven routes); #1518 (low-priority: the shelter file's `publish_date`
  vs its route's last-updated date — left as-is this session pending a
  convention decision).
- `routeTree.gen.ts` churn (chat/forms/form_builder) is generated build output,
  excluded from the commit.
