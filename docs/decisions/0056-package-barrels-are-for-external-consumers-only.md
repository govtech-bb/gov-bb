# 0056 — A package's barrel is for external consumers only

## Context

`apps/forms` carried 6 circular import cycles (ARCH-05, #1407), all within the
app. Five of them routed through the `lib/form-builder/index.ts` barrel acting
as a hub: a module imported a helper from a sibling file, but did so *through*
the barrel (`@forms/lib`) — and the barrel re-exports that same sibling, closing
a loop. For example `build-form.ts` imported `setupRepeatSteps` from
`@forms/lib`, while `@forms/lib` re-exports `build-form.ts`'s own `buildForm`.

The sixth was a pure type cycle: `behavior-helper.type.ts` imported `FormMeta`
from `renderer.type.ts`, and `renderer.type.ts` imported `RepeatableStepSettings`
back from `behavior-helper.type.ts` — a shared type living in a module that also
depended on one of its consumers.

Barrel cycles are not cosmetic: they cause fragile module-init ordering
(undefined-at-import-time bugs that surface in a production bundle but not in
dev), defeat tree-shaking, and slow incremental builds. They are a latent source
of "works in dev, breaks in prod bundle" failures.

## Decision

A package's barrel (`index.ts`, exposed as `@forms/lib`, `@forms/types`, etc.)
is the **public entry point for external consumers**. It is not an intra-package
import convenience.

1. **Modules inside a package import directly from sibling files** — `./form-fetcher`,
   `./helpers/repeatable-helper`, `../field-mapper` — never back through their
   own package's barrel. The barrel may freely re-export those modules for the
   outside world; intra-package code just must not go through it.
2. **Shared types live in leaf modules.** A type that two siblings both need goes
   in a module that imports nothing from either of them (e.g.
   `types/repeatable.type.ts` holding `RepeatableStepSettings`/`RepeatableConfig`,
   depending only on `field-mapper.type.ts`). A type module must never import
   from a module that imports it back.

Together these keep each package's internal import graph acyclic.

## Consequences

- The `lib/form-builder/index.ts` barrel is unchanged in what it exports — it
  simply stopped being imported from inside the package. External consumers
  (`@forms/lib`, `@forms/types`) see no API change.
- New intra-package helpers are wired sibling-to-sibling. Reaching for
  `@forms/lib` from within `apps/forms/src/lib` is the smell that reintroduces a
  cycle; a cycle detector (`madge --circular --ts-config tsconfig.base.json`,
  which must be given the tsconfig so it resolves the `@forms/*` path aliases)
  catches it.
- A pre-existing cycle in `packages/form-conditions` (`index.ts ↔ internals.ts`)
  is out of scope for #1407 and remains; this ADR's principle applies to it too
  when it is addressed.
