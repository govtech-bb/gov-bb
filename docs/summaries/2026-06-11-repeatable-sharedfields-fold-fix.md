# Repeatable + sharedFields: submit one instance, not two (#1257)

## Context

On **Get a Primary School Textbook Grant**, the repeatable `child-details`
step (`min:1`) also carries a `sharedFields` behaviour. The applicant was asked
the per-child fields **twice** and the form **submitted the child twice**. A
first fix (#1259) touched only the renderer, passed the PR gate, then the
**post-deploy textbook smoke failed with `POST /submissions 422`** and was
reverted by #1261. This session re-did the fix correctly.

## What we did

Two coordinated client changes, plus tests and the smoke walk (commit
`368736e0`):

- **Renderer** (`repeatable-helper.ts`) — re-applied #1259: the shared-fields
  source step keeps only the shared fields.
- **Fold** (`forms.ts`, `formatDataForSubmission`) — the half #1259 lacked: the
  base step is no longer folded as an instance when the step has shared fields;
  instances are folded from `~1..~min` only, with `sharedData` merged into each.
- Smoke (`get-a-primary-school-textbook-grant.smoke.spec.ts`) walks two pages
  (shared on base, per-child + `addAnother` on `~1`); unit tests for both halves.

## Why we did it that way

The shape of the bug is a **mismatch between two layers** that #1259 only fixed
on one side:

- The renderer materialises a shared-fields repeatable step as a *shared-values
  base page* (shared fields, filled once) + `~1..~min` instance pages.
- The submit-time fold (`forms.ts`) independently walks `orderedStepIds` and
  pushed **one instance per step id, including the base**, each merged with
  `sharedData`.

So when #1259 stripped the per-instance fields off the base page, the fold still
emitted the base as instance 0 — now an *incomplete* instance missing the
required per-child fields → 422. Before #1259, the base carried all fields, so
instance 0 was complete but the form double-submitted. The fold had to learn the
same "base is not an instance" rule the renderer follows.

**Server change rejected — and #1261's root cause was wrong.** #1261 blamed the
server ("it expects the per-instance fields on the base step / treats the base
as instance 1"). Reading `apps/api/.../submission-expand.ts` (`expandSubmission`)
disproved that: the server is page-layout-agnostic — it wants `values[stepId]`
to be an array of complete instance objects, validates each field against the
step's `elements` (the shared fields **are** step elements, so merging them is
valid), and checks `max`, not `min`. It does not care how the client lays out
pages. So the correct fix is **client-only**: stop folding the base as an
instance. No server change needed.

**The "has shared fields" signal — derived, not added.** The first draft added
an explicit `hasSharedFields: boolean` to `RepeatableConfig`. The user pushed
back: why change the shape? `RepeatableConfig` already carries `sharedData`,
which `setupRepeatSteps` populates with one key per shared `fieldId` (and leaves
empty/undefined otherwise), and the fold function never receives the steps'
behaviours anyway. So `Object.keys(sharedData ?? {}).length > 0` is an exact,
already-present structural signal. Backed out the field; kept only a clarifying
comment. This is a *structural* signal (keys seeded at setup, never added/removed
at runtime), not a value signal — so a user blanking an optional shared field
can't flip it.

**Tradeoff named:** the explicit flag would have been marginally more
self-documenting at the fold site; deriving from `sharedData` avoids widening a
shared type for one consumer and can't drift out of sync with the renderer that
seeds it. We chose the derived signal.

## What we almost got wrong

The existing `sharedData merging` unit test set up an *unreachable* state —
`sharedData` present but `orderedStepIds: ["personalInfo"]` with no `~1` — and
asserted the base was folded as an instance with shared values merged. That is
exactly the double-submit behaviour the bug describes; it only "passed" because
it modelled a state `setupRepeatSteps` never produces (shared fields always
generate `~1..~min`). Updated it to the real layout (base + `~N`) asserting
shared values merge into the instances, base excluded.

## Open questions

- **Server `min` hardening (out of scope, follow-up candidate).** The server
  validates `max` instances but not `min`. A repeatable step submitted with
  fewer than `min` instances is silently accepted. Defense-in-depth, separate
  from this bug.
- **Proof is post-deploy only.** The PR gate smokes term-leave only; the
  `get-a-primary-school-textbook-grant` smoke (the only gate that submits for
  real and catches this class of bug) runs in `deploy-sandbox.yml` after merge.
  A green PR is not sufficient proof here.
