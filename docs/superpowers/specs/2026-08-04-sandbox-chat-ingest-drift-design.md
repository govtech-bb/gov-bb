# Sandbox chat-ingest failure + content-drift guard — design

Date: 2026-08-04
Status: Approved (design), pending implementation plan
Related: govtech-bb/gov-bb#2149, #2142; cutover 2026-07-30 (chat sandbox → govbb-chatbot)

## Context

Since the 2026-07-30 cutover, `chat.sandbox.alpha.gov.bb` is served by the
`govtech-bb/govbb-chatbot` repo (Amplify app `d3snq1f0c10466`), not gov-bb
`apps/chat`. gov-bb's `deploy-sandbox.yml` still carries the pre-cutover chat
jobs, and one of them now fails on every chat-affected sandbox deploy.

### The failure (root cause)

Job **`Build, Push & Trigger chat-ingest`** in `deploy-sandbox.yml`:

1. Its "Trigger" step invokes the RAG-indexer Lambda, which *does* start an
   ingest Fargate task (response `{"status":"started","taskArn":"…"}`).
2. Its "Wait for ingest to complete" step then polls
   `https://chat.sandbox.alpha.gov.bb/api/health` for a run started **after**
   the trigger. But that endpoint is now owned by **govbb-chatbot**, whose
   `lastIngest` reflects its own pipeline (stuck at `2026-07-30T18:07:22Z`).
   gov-bb's ingest no longer surfaces there (ownership moved + schema reset at
   cutover), so the poll never advances and the job **times out at 15 min**.

Consequence: the job red-X's every chat-affected sandbox deploy, and the
`Promote to staging (on sandbox green)` job is skipped — blocking releases.
The sibling `amplify-chat` job "succeeds" but is also orphaned: it targets
`AMPLIFY_APP_ID: d3snq1f0c10466`, i.e. gov-bb reaching across to RELEASE-build
*govbb-chatbot's* app.

### Why the user's real concern is content drift — and where it actually lives

The stated worry was that chat content would fork and drift out of the
monorepo. Investigation shows the **content data does not fork**:
govbb-chatbot's ingest (`src/lib/rag/corpus-source.ts`) fetches a tarball of
gov-bb **`main`** per run and ingests `apps/landing/src/content`
(`CONTENT_SUBDIR` default; 101 `.md` files = the live corpus). Its local
`content/govbb` (5 files) is explicitly dev fixtures. The 15-minute cron
re-fetches `main`, so a content merge in gov-bb reaches chat within minutes —
this per-run fetch *is* the anti-drift mechanism.

The residual, real drift surface is narrower and **code/contract**, not data:
govbb-chatbot has its own forked content parser (`src/lib/rag/content.ts`,
`loadContentDir` + zod `documentInputSchema`) pinned to gov-bb `main`. A
content change in gov-bb that violates the ingest contract (frontmatter shape,
markdown path) passes gov-bb CI green today and only breaks **later**, in
govbb-chatbot's ingest cron/deploy. That lag is the drift to close.

## Goal

1. Stop the sandbox deploy failure and restore auto-promotion to staging.
2. Make a monorepo content change that would break chat ingest fail **at
   gov-bb PR time**, not 15 minutes after merge.

## Non-goals

- Do **not** touch prod/staging chat. They were not cut over — `deploy-prod.yml`
  and `deploy-staging.yml` still deploy gov-bb `apps/chat` and are healthy
  (prod `docCount:82`, staging `docCount:84`). Scope is `deploy-sandbox.yml`.
- Do **not** pin the ingest tarball to a released ref. Fetching `main` per run
  is the anti-drift feature; pinning would freeze the corpus and work against
  the goal.
- Do **not** move ingest compute back into gov-bb (rejected option C — adds
  cross-repo DB coupling without reducing drift beyond this design).
- `apps/chat` source retirement is a separate decision (out of scope).

## Design

### Component 1 — Remove the orphaned sandbox chat jobs (closes #2149)

File: `.github/workflows/deploy-sandbox.yml`

- Delete the `deploy-chat-ingest` job.
- Delete the `amplify-chat` job.
- Remove the `chat` nx-affected output from the `setup` job and any
  `chat`-derived gating.
- Remove `chat` entries from downstream `needs:` and the deployment `summary`
  table so the summary stays accurate.

govbb-chatbot's own `deploy-sandbox.yml` already owns both jobs (same
`chatbot-ingest-sandbox` image, same `/chatbot/sandbox/rag-indexer-name`
indexer); its code comments even note it "races" gov-bb's leftover job.
Removing gov-bb's jobs ends the race and the false failure. Effect: chat-affected
sandbox deploys go green and `Promote to staging` runs again.

### Component 2 — Content-contract gate in gov-bb CI (the anti-drift mechanism)

A gov-bb test that validates `apps/landing/src/content` against the conditions
that actually HARD-FAIL govbb-chatbot's ingest — a faithful mirror of its raw
parser (`src/lib/rag/content.ts` → `loadContentDir`/`splitFrontmatter`) and
`corpus-source.ts`, verified against `types.ts`. It flags only what would break
ingest, not stricter content-quality rules (spec-owner ruling 2026-08-04):

- Any `*.md` except `README.md`, recursively, that opens with a `---`-fenced
  frontmatter block must have YAML that parses. A missing fence, non-mapping
  frontmatter, and an empty body are all tolerated by the parser (body = whole
  text / meta = `{}` / page skipped), so they are NOT flagged.
- The corpus directory resolves at the expected path with at least one markdown
  page (mirrors `corpus-source.ts`, which throws on zero pages — guards a
  `CONTENT_SUBDIR` move/wipe).

Placement: extend the existing content-test pattern
(`apps/landing/src/content/registry.test.ts`) rather than introduce a new
harness, and ensure it runs in gov-bb CI (`ci.yml`) on PRs touching
`apps/landing/src/content`. A breaking content change then fails the gov-bb PR.

Source-of-truth note: this is a lightweight mirror of govbb-chatbot's contract,
with a comment cross-linking `govbb-chatbot/src/lib/rag/content.ts`. Small,
stable duplication accepted per YAGNI over building a shared cross-repo schema
package; if the contract grows, promote it to a published package later.

## Verification

- **Component 1:** After the change, a chat-affecting sandbox deploy no longer
  runs `deploy-chat-ingest`/`amplify-chat`; the run is green and
  `Promote to staging` executes. Confirm chat still serves
  (`chat.sandbox.alpha.gov.bb/api/health` → `db:connected`) since govbb-chatbot
  owns it. Re-run of the previously-failing workflow (or the next chat PR)
  is green.
- **Component 2:** Add a temporary fixture with malformed frontmatter / empty
  body under a tmp dir in the test and assert the validator rejects it (red),
  then assert the real 101-doc corpus passes (green). The test fails on a
  deliberately broken content page and passes on `main`'s content.

## Risks

- Contract test drifts from govbb-chatbot's real schema. Mitigation: keep the
  mirrored contract minimal (the four rules above are stable); cross-link the
  source. Revisit as a shared package only if the schema churns.
- Removing `chat` wiring leaves a dangling reference (needs/summary) →
  workflow parse or nx error. Mitigation: grep `deploy-sandbox.yml` for `chat`
  after edits; run the workflow's affected-detection locally / on a draft PR.
