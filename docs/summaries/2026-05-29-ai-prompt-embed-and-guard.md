# Embed the AI system prompt and guard it against registry drift (#427)

## Context

The AI form builder generated recipes that failed ref resolution and missed
half the component palette. Root cause was a dual-source trap
(see project memory "AI prompt .ts vs .md"): the **live** prompt was
`form_builder_api`'s `getSystemPrompt()`, which did a `process.cwd()`-relative
`readFileSync` of `system-prompt.md` in the *form_builder app* tree — a
different package — and silently fell back to a 3-line prompt when that path was
absent at runtime (Docker-fragile). A corrected, post-#416 `system-prompt.ts`
sat next to that `.md` but was imported nowhere. So every prompt fix landed in a
file the running service never read. The plan
(`docs/plans/427-ai-prompt-embed-and-fix.md`) chose to embed the corrected
prompt as a TypeScript constant inside the consuming package and delete both
orphan files.

## What we did

- **Rewrote `apps/form_builder_api/src/ai/system-prompt.ts`** to return an
  embedded `SYSTEM_PROMPT` constant — no `readFileSync`/`existsSync`, no silent
  fallback. Ported the corrected orphan `.ts` content as the base.
- **Content fixes:** `components/contact-number` → `components/contact-telephone`
  (the ref that actually resolves); added a "Generic Primitive Components"
  section surfacing all 10 `generic-*` primitives + `show-hide`; verified all 8
  registry blocks are present.
- **Deleted** the dead `apps/form_builder/.../prompts/system-prompt.{md,ts}`.
- **Added `apps/form_builder_api/src/ai/system-prompt.spec.ts`** — a drift guard.

## Why we did it that way

- **Embed, don't patch the `.md`.** The plan weighed three options; embedding
  the constant in the package that consumes it kills the cross-package file I/O
  *and* the dead second source permanently. A shared nx lib was rejected as
  overkill for a single consumer (the monorepo's project-reference plumbing
  gotcha buys nothing here).
- **Guard via `getRegistryItem`, the live resolution path.** `getCatalog()`'s
  `.components`/`.blocks` arrays turned out to be form-builder's *small legacy
  builtin demo set* (11 components, 3 blocks: `name`, `physical-address`,
  `date-of-birth`) — **not** the registry's 44 components / 8 blocks. The reason
  every semantic ref still resolves is that `getRegistryItem` falls back to
  `REGISTRY_*` — which is exactly how the live app resolves. So the spec asserts
  each prompt ref resolves through `getRegistryItem`, mirroring production, and
  asserts the registry's 8 blocks (an explicit list, not `catalog.blocks`) are
  surfaced. The `MIGRATED_SLASH_REFS` banned-list mirrors the #416 guard in
  `apps/api/.../recipe-registry-refs.spec.ts`.
- **Two fixes the plan didn't anticipate, surfaced by writing the test first:**
  1. The JSON-schema example used a placeholder ref `components/component-key`,
     which a strict token extractor would (correctly) flag as non-resolving.
     Swapped it for the real `components/name` — valid and self-consistent.
  2. Rule 2's *negative* examples (`components/national-id-number (NOT
     components/national-id)`) are non-resolving by design. Rewrote the "NOT"
     side as bare keys (`the key is \`national-id-number\`, NOT \`national-id\``)
     so they read as wrong-key warnings, not refs — keeping the guard strict
     without special-casing the extractor.
- **`contact-number.ts` registers `fieldId: "contact-telephone"`** — the
  filename is a red herring; only `components/contact-telephone` resolves. A
  dedicated spec assertion pins the rename both ways.

## Verify / status

- New guard spec: 7/7 (watched it fail 5/7 first against the stale `.md`).
- `nx run-many -t build --exclude=landing`, `tsc -b`, full `nx run-many -t test`
  all green (the lone `form-builder-app:test` run-many failure is the known
  Vite-teardown flake — passes in isolation).

## Known nits (accepted, not fixed)

- `generic-radio`/`generic-number` are described in several prompt sections.
  Intentional reinforcement; consistent, no contradiction.
- Guard regex `${prefix}/[a-z0-9-]+` requires lowercase, so an uppercase-typo
  ref (`components/Name`) would slip past unflagged. Negligible — the prompt is
  uniformly lowercase-kebab.

## Out of scope

- Custom-component prompt injection (#292) — DB customs are still appended at
  runtime by `routes/ai.ts` via the "Live Custom Components" section.
- Committed-recipe orphan refs (#426).
