# Async-job AI Edit Form — eliminate the Amplify 28s timeout (#1137)

## Context

The AI **Edit Form** action was a single synchronous call:
`editRecipe` → `POST /builder/ai/edit` → one Bedrock Converse. Because every
edit returns the *complete* modified recipe and output-token count dominates
latency, large forms ran long and hit Amplify `WEB_COMPUTE`'s hard ~28s SSR
request timeout — a 504 that TanStack Start's server-fn client surfaced as the
opaque `"Invariant failed"`
([#1129](https://github.com/govtech-bb/gov-bb/issues/1129), 83 hard timeouts in
14 days). [#1129](https://github.com/govtech-bb/gov-bb/issues/1129) shipped the
**honest-failure** mitigation (PR #1131: a 25s client abort + clear message),
then closed. This session is the **durable fix** tracked as
[#1137](https://github.com/govtech-bb/gov-bb/issues/1137): make the edit immune
to the timeout entirely. Implemented on `worktree-async-edit-job-1137`, targets
`sandbox`.

## What we did

Mirrored the existing PDF upload pipeline (`ai-upload.ts`) — the edit returns a
job id immediately and the client polls until Bedrock finishes, so no single
request approaches 28s.

**Backend (`form-builder-api`)**
- **`src/ai/recipe-generation.ts`** (new) — factored the tail shared by edit and
  upload (`chat → extractRecipe → collectUnknownRefs → {recipe, reply,
  unresolvableRefs}`) into `generateRecipeResponse`, returning a `RecipeResponse`.
- **`src/routes/ai-upload.ts`** — `runBedrock` now calls the helper;
  `BedrockState.result` is the shared `RecipeResponse`.
- **`src/routes/ai.ts`** — removed the synchronous `editHandler` + `POST /edit`.
  Added an in-memory `editStateByJobId` Map (`running | done | failed`) with the
  same 1h-cutoff / 5-min `.unref()` sweep as the PDF path, `runEditBedrock`
  (fire-and-forget), `startEditHandler` (`POST /edit/start` → `{ jobId }`, via
  `randomUUID()`), and `statusEditHandler` (`GET /edit/status/:jobId` →
  `generating | done | failed`; unknown id → 404 "This edit session expired —
  please try again.").

**Frontend (`form-builder-app`)**
- **`server/ai-builder/convert.ts`** — replaced `editRecipe` with
  `startEditRecipe` (`POST …/edit/start`) and `getEditStatus`
  (`GET …/edit/status/:jobId`, `strict:false`).
- **`server/ai-builder/types.ts`** — added the `EditStatusResponse` union
  (reusing `ConvertResponse` for the `done` branch).
- **`routes/builder/-ai-sidebar.tsx`** — extracted a shared
  `pollUntilDone(getStatus, abort, { firstPollMs, intervalMs, timeoutMs })`;
  `handleUpload` uses it (2s cadence), `handleEditForm` now starts + polls with a
  fast-first cadence (400ms then 2s, 3-min cap) sharing the existing
  `pollAbortRef`. Dropped the #1131 `EDIT_TIMEOUT_MESSAGE` /
  `isTimeoutOrInvariant` special-casing (the long sync call that produced
  "Invariant failed" is gone).

## Why it looks the way it does

- **Async job over alternatives.** A synchronous fast-path was rejected because
  latency tracks *output* size (every edit returns the full recipe), so it would
  still 504 on exactly the large-form case #1129 is about. `ConverseStream` was
  rejected as higher-risk (threading a stream through 3 hops + abandoning the
  TanStack single-value server-fn model) for no extra robustness over the job.
- **In-memory state, accepted limitation.** State lives in a `Map`, exactly like
  the PDF path — `form-builder-sandbox` runs a single ECS task (a deploy briefly
  allows 2 via `maxPercent: 200`). Unlike PDF (re-derivable from Textract's
  7-day result), an edit job is pure Bedrock with no external anchor: a restart
  mid-edit loses the in-flight job, the next poll 404s, and the client shows the
  interrupted message. No new infra (DB/Redis), consistent with the PDF path's
  pragmatism. Revisit only if the service ever scales beyond one steady task.
- **Fast-first poll** (400ms then 2s) keeps a 2–3s edit feeling essentially
  synchronous — it returns on the first or second poll.
- **`pollUntilDone` terminal branch is explicit** (returns only on
  `status === "done"`, else throws) so an unexpected 200 body surfaces as an
  error instead of a silent recipe-less "done" — a defensive hardening from code
  review.

## Deferred / follow-up

- The in-memory job-store (`EditState`/`BedrockState` types, the 1h sweep, and
  the status→response mapping) is now duplicated between `ai.ts` and
  `ai-upload.ts`. Code review flagged collapsing it into one shared job-store
  helper; deferred to keep this PR focused on the edit path.

## Verification

- `form-builder-api`: 197 passed (5 skipped) — new `recipe-generation.spec.ts`,
  rewritten `ai.edit.spec.ts` (start/status flow).
- `form-builder-app`: 577 passed — rewritten `-ai-sidebar.spec.tsx`, migrated
  `builder/index.spec.tsx` Edit Form integration tests.
- `nx run-many -t build --exclude=landing,cms`: 13 projects ✓.
- `tsc -b --force`: clean (covers the spec files the nx build skips).
- `form-builder-app:lint` is pre-existing-red on `sandbox` (errors in
  `github-recipes.ts`, `mda-contacts.spec.ts`, `publish.ts`, etc.); the changed
  files in this session introduce no new lint errors.
