# Make the form-builder Deploy PR base branch configurable

## Context

The form-builder **Deploy** action opens a GitHub PR that adds the recipe file.
The PR's base branch was hardcoded to `dev` in
`apps/form_builder/app/server/publish.ts` (`const BASE_BRANCH = "dev"`), used for
the base-tip SHA read, the new branch's parent, and the PR `base`. The repo
owner already comes from `GITHUB_ORG`, so the base branch was the one deploy
target that couldn't move without a code change. Issue #442 asked to make it an
env var so the target can shift (e.g. to `sandbox` or a release branch) at
runtime.

## What we did

- `publish.ts`: added `resolveBaseBranch()` — reads `process.env.PUBLISH_BASE_BRANCH`,
  trims it, falls back to `dev`. It's the **single source of truth**. Replaced
  every `BASE_BRANCH` usage in `publishRecipe` with the resolved value, including
  the two error strings (`Failed to read ${branch} branch`,
  `Version … already exists on ${branch}`) so no hardcoded `dev` remains in the
  file. Added a `getPublishBaseBranch` `createServerFn` (returns `string`) so the
  client can learn the runtime value.
- `routes/builder/ui/index.tsx`: the loader now awaits `getPublishBaseBranch()`
  alongside `getCatalogFn()` (via `Promise.all`) and returns
  `{ catalog, baseBranch }`; `baseBranch` is threaded into `<PublishModal>`.
- `routes/builder/ui/-publish-modal.tsx`: new `baseBranch` prop replaces the two
  hardcoded `<code>dev</code>` spots (pre-publish copy + success copy).
- `.env.example`: documented `PUBLISH_BASE_BRANCH` (defaults to `dev`).
- Tests: `publish.spec.ts` gained a configured-branch case (asserts the step-1
  ref URL and PR `base` use the env value) and a configured-branch error case;
  the existing default-branch wording assertion moved from "in dev" to "on dev".
  New `-publish-modal.spec.tsx` covers the branch rendering in both copy spots.
  `index.spec.tsx`'s loader-data mock gained `baseBranch` and mocks
  `getPublishBaseBranch`.

## Why we did it that way

- **Server fn in the loader, not a `VITE_` var.** A single `VITE_`-prefixed var
  read by both server and client would be simplest for display, but Vite bakes
  `VITE_*` into the bundle at build time — changing the target would need a
  rebuild, defeating the issue's "no code change" goal. Reading
  `process.env` straight from the loader fails too: a TanStack Start loader runs
  on the client during client-side navigation, where `process.env` is
  `undefined`. So we followed the existing `getCatalogFn` precedent — a
  `createServerFn` resolves the value server-side and the loader awaits it.
- **One `resolveBaseBranch()`, two callers.** `publishRecipe` and
  `getPublishBaseBranch` both call it, so the branch the modal *shows* can never
  diverge from the branch the PR is *opened against*.
- **Replaced the error strings too, not just the modal.** The issue's intent is
  "no hardcoded `dev`". Leaving "Failed to read dev branch" / "already exists in
  dev" would have lied once the target moved. `Failed to read ${branch} branch`
  keeps the default-`dev` message identical, so that error path needed no test
  change.

## What we almost got wrong

`tsc -b apps/form_builder` in isolation reports pre-existing serialization-type
errors in `registry.ts` / `ai/index.tsx` that have nothing to do with this
change — confirmed by stashing the diff and re-running. The real CI gate is
`pnpm exec tsc -b` from the repo root (it has the full project-graph context),
which passes with 0 errors. Don't be misled by the per-project invocation.

## Open questions

None. Naming (`PUBLISH_BASE_BRANCH`) and transport (loader + server fn) were
settled in the plan with Isaiah before implementation.
