# Break the circular import cycles in apps/forms (ARCH-05, #1407)

## Context

An `apps/` consolidation audit (fallow + semantic agents) flagged 6 circular
import cycles, all inside `apps/forms`. Five hubbed on the
`lib/form-builder/index.ts` barrel; the sixth was a pure type cycle between
`behavior-helper.type.ts` and `renderer.type.ts`. Behaviour-preserving cleanup —
no runtime change intended.

## What we did

- Repointed 3 intra-package imports off the `@forms/lib` barrel to sibling
  files: `lib/api/forms.ts`, `lib/form-builder/build-form.ts`,
  `lib/form-builder/helpers/repeatable-helper.ts`.
- Extracted `RepeatableConfig` + `RepeatableStepSettings` into a new leaf
  `types/repeatable.type.ts`; updated `renderer.type.ts`, `props.type.ts`,
  `behavior-helper.type.ts`, and the `types/index.ts` barrel to import from it.
- Recorded the principle in ADR
  [0056](../decisions/0056-package-barrels-are-for-external-consumers-only.md).

## Why we did it that way

- **The detector lies without the tsconfig.** A bare
  `madge --circular apps/forms/src` reports only 2 cycles — it can't resolve the
  `@forms/*` path aliases, so the barrel-routed cycles are invisible. Passing
  `--ts-config tsconfig.base.json` (where the `@forms/*` paths live) surfaces all
  of them. Anyone re-checking this must pass the tsconfig or they'll conclude the
  cycles are already gone.
- **The barrel stays intact.** The fix is purely about *who* imports the barrel,
  not what it exports. `@forms/lib` and `@forms/types` keep identical public
  surfaces, so no external consumer changed — the blast radius is just the import
  lines inside the package.
- **Leaf module over re-export for the type cycle.** The back-edge was
  `renderer.type → behavior-helper.type` (for `RepeatableStepSettings`). Moving
  the shared types into a dependency-free leaf both siblings import kills the
  edge cleanly. The alternative — having `behavior-helper.type` re-export from a
  leaf and leaving `renderer.type` pointed at it — would also break the cycle but
  leaves a misleading "shared type lives in behavior-helper" signal; the leaf is
  the honest home.
- **`form-query.ts` needed no change.** The plan listed it, but it already
  imported `./form-fetcher` / `./build-form` directly — stale plan entry, noted
  and skipped.
- **No new tests.** Pure import re-pointing with no behaviour change; the
  existing 736-test forms suite is the regression net, and `tsc -b` would catch
  any orphaned/wrong import. Verified: madge 0 in-scope cycles, `forms:build`
  green, `forms:test` green, `tsc -b` exit 0.

## What we almost shipped by accident

The `forms:build` regenerated `routeTree.gen.ts` with different quote/semicolon
style (TanStack route generator), adding 82 lines of churn to the diff. Reverted
it — generated noise, unrelated to the change.

## Open questions

- A cycle in `packages/form-conditions` (`index.ts ↔ internals.ts`) remains. It's
  in `packages/`, not `apps/forms`, so it's out of scope for #1407 — left for a
  separate issue.
