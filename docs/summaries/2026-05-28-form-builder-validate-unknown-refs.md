# form_builder: flag unknown component/block refs in validation

## Context

Implemented from `docs/plans/form-builder-validate-unknown-refs.md` on branch
`form-builder/validate-unknown-refs` (merges into `sandbox`). Issue
[#359](https://github.com/govtech-bb/gov-bb/issues/359).

Recipe validation only ever checked ref *format* (the `^components/` /
`^blocks/` regex), never ref *existence*. A recipe pointing at a missing
component (`components/does-not-exist`, a removed block, a recipe authored
against a different registry version) validated green, then behaved
inconsistently across the two hydrators:

- `packages/form-builder/src/resolution.ts` `hydrateForm()` (preview path) —
  `console.warn` + `continue`, **silently dropping** the field.
- `apps/api/src/registry/resolution.ts` (production renderer) — already **threw**
  `UnresolvableComponentError`.

Same bad recipe, quiet field-loss in preview, detonation in prod.

## What we did

- **`packages/form-builder/src/errors.ts`** (new) — `UnknownRefError` carrying
  `unknownRefs: { ref, path }[]`, with a message that enumerates the refs.
  Exported (with the `UnknownRef` type) from the package index.
- **`packages/form-builder/src/resolution.ts`** — `hydrateForm` now collects
  every unknown ref across the whole recipe in one pass, then throws
  `UnknownRefError`. Replaced the `console.warn` + `continue` silent skip. The
  `for…of` became a `forEach` so the element index is in hand for the path
  `steps[<stepId>].elements[<i>].ref`.
- **`apps/form_builder_api/src/routes/registry.ts`** — extracted the inline
  `/validate` arrow into an exported `validateHandler`, then added a
  catalog-dependent unknown-ref walk *after* the existing contract-parse and
  fieldId/stepId collision checks: walk every `step.elements`, and for any ref
  that doesn't resolve, push `{ path, message }`. Returns `{ ok: false, issues }`
  with all unknown refs together.
- **Tests** — `resolution.spec.ts`: replaced the two stale "skips with
  console.warn" tests with throw-on-unknown-ref and collect-all-across-steps
  cases. `registry.validate.spec.ts` (new): unknown ref → `ok:false` with the
  expected issue path/message; all-refs-resolve → `ok:true`.
- **ADR-0017** records the "recipe ref resolution fails loud" principle.

## Why we did it that way

- **Existence check at the endpoint, not in `validateFormContract`.** Keeps
  `packages/form-types` free of a registry dependency (ADR-0010). The schema
  regex stays prefix-only. This mirrors where the fieldId/stepId collision
  backstop already lives.
- **Collect-all, not fail-fast,** in both layers — one complete report per pass,
  so an author fixes everything at once rather than fix-one-rerun.
- **Preview endpoint left as-is.** It already catches and returns
  `err.message` (500); `UnknownRefError.message` enumerates the refs, so it
  surfaces a clear error without a new response contract. This resolved the
  plan's open question (no structured `{ref,path}[]` needed in the preview JSON).
- **No client pre-flight, no schema change** — both explicitly dropped in the
  plan. `/validate` is the single source of truth; the client already renders
  the server's issues, and a lagging client catalog would risk false positives.
- **`validateHandler` extracted to a named export** so the route is unit-testable
  the way the existing `forms.*Handler` tests are (import handler, mock `res`,
  mock `getFullCatalog`) — no supertest harness needed.

## What we almost got wrong / drift from the plan

- **Worktree build environment.** `nx run-many -t build` and `tsc -b` initially
  failed in the worktree with `TS2307: Cannot find module '@govtech-bb/...'` —
  for files I never touched. Confirmed identical failure on the pristine
  `sandbox` branch: the symlinked `node_modules` breaks tsc's workspace-package
  resolution. Running `pnpm install` in the worktree (2.5s via the shared store)
  produced a real `node_modules` and unblocked the gates. The jest-via-symlink
  approach is fine for tests but not for `tsc -b` builds here.
- Reverted the spurious `apps/forms/src/routeTree.gen.ts` churn that nx
  build/test regenerates.
- Plan's verify step said `nx test form-builder` / the `form_builder_api` test —
  the nx project names are `form-builder` and `form-builder-api`.

## Verification

- `nx run-many -t build --exclude=landing` → all 12 projects compile.
- `tsc -b` → clean (exit 0).
- `nx test form-builder` (84) + `nx test form-builder-api` (15) → pass.

## Open questions

- **Manual browser smoke pending (Isaiah).** Author a recipe with
  `ref: "components/this-does-not-exist"`, click **Validate** → expect a failed
  issue at the unknown ref; click **Preview** → expect a clear error rather than
  a silently-dropped field.
