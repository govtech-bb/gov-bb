# Recipe-apply failures: accurate error + Retry apply from memory (#1873, #1532, #1871)

## Context

When the AI sidebar's recipe-apply step (`onApplyRecipe`) **rejected** after a
successful generation, both `handleUpload` and `handleEditForm` routed the
rejection through their own catch blocks — so the user saw "Upload failed…" or
a generic generation error (#1532, #1871), and the already-generated recipe was
discarded, forcing a re-upload that re-billed Textract + Bedrock just to
reproduce it (#1873). Plan: `docs/plans/1873-recipe-apply-retry-from-memory.md`
(planning session 2026-07-10 decided all three ship as one change).

## What we did

- Extracted the apply-and-report tail of `handleResponse` into an
  `applyRecipe` helper (`-ai-sidebar.tsx`) with a try/catch around
  `onApplyRecipe`: a rejection stashes `{recipe, unresolvableRefs}` in new
  `pendingApply` state and shows "Couldn't apply the recipe to the editor."
- A **Retry apply** button (rendered under the error block while
  `pendingApply != null`) re-invokes the helper from the stash — no server
  fns re-run. Both job-start handlers clear the stash alongside
  `setError(null)`.
- Seven TDD tests in `-ai-sidebar.spec.tsx` (red first, then green): the six
  acceptance cases from #1873 plus one pinning the cancelled-retry behavior.

## Why we did it that way

- **One catch inside the shared helper, not two call-site wrappers.** Both AI
  paths funnel through `handleResponse`, and `recipe`/`unresolvableRefs` are
  already in scope there to stash. Wrapping each call site (the shape #1532's
  sketch implied) would duplicate the catch and still need the stash plumbed
  out.
- **All three issues as one change.** Landing the plain catch first (issue
  option B) would be an intermediate we'd immediately rewrite for the retry
  stash.
- **Rejection ≠ resolved `result.error`.** A rejection means the editor
  pipeline *crashed* — retry plausibly helps. A resolved `{error}` is a
  deterministic validation verdict — retry would fail identically, so that
  path clears the stash and keeps its existing message behavior.
- **A cancelled retry keeps the stash** (beyond the plan, pinned by a test).
  `applyAiRecipe` resolves `{reason: "cancelled"}` when the user declines the
  dirty-form `window.confirm`. Clearing the stash there would dead-end the
  user into the exact billed regeneration #1873 exists to avoid — e.g. they
  decline because they want to save first, then retry. The fresh-generation
  flow is unaffected: the stash is always null by the time it applies.
- **`setError(null)` on applied success** — new, so a retry success clears the
  stale apply-failure message; a no-op in the fresh flow (error is cleared at
  job start), so no existing behavior moved.
- **Consequence pinned in a test:** apply rejections no longer reach
  `handleUpload`'s outer catch, so its typed-context restore doesn't run for
  them — correct, because a successful upload consumed the context.
- **An `applying` flag locks out the retry button and both job starters while
  an apply is in flight.** Preventing the overlap entirely (rather than
  staleness-checking the continuation) is what keeps a stale retry from
  dispatching a second `LOAD_DRAFT` over a newer job's result — the sidebar
  can't un-dispatch once `onApplyRecipe` is invoked.

## What we almost got wrong

- **Shipped the retry button with no re-entrancy guard**, on the premise that
  the apply pipeline is near-synchronous with a blocking `window.confirm`.
  Code review disproved it: `applyAiRecipe` runs a network `validateRecipe`
  call *before* the confirm, and skips the confirm entirely when the editor
  has no unsaved changes — exactly the state after a crashed first apply. In
  that window a double-click fires two applies, and a fresh Edit/Upload job
  can start only to have the stale retry's continuation clobber its state.
  Hence the `applying` flag above, pinned by the "disables Retry apply and
  blocks new jobs" test.
- Annotating the test helper's parameter as `ReturnType<typeof vi.fn>` widens
  to `Mock<Procedure | Constructable>` under Vitest 4 and introduced a NEW
  `tsc -b` error against the baseline-red spec set. `Parameters<typeof
  setup>[0]` matches what `setup` actually accepts. (Verified with the
  baseline-vs-current error-list diff: 32 = 32, the only textual delta being a
  pre-existing error shifted by inserted lines.)

## Open questions

None. Real-browser smoke (plan verify step 5) rides on the PR preview /
sandbox rather than a local run.
