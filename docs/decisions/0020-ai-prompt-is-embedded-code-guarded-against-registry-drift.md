# 0020 — The AI prompt is embedded code, guarded against registry drift

## Context

The AI form-builder's system prompt names registry refs (`components/<x>`,
`blocks/<x>`) that the model must emit verbatim into recipes. Two failure modes
had been biting us:

1. **Cross-package runtime file load.** The live prompt was loaded by
   `form_builder_api` via a `process.cwd()`-relative `readFileSync` of a `.md`
   that lived in the *form_builder app* package, with a silent 3-line fallback
   when the path was absent. The path was Docker-fragile, and a corrected copy
   (`system-prompt.ts`) that nothing imported sat beside the `.md` — so prompt
   fixes landed in a file the running service never read (#427, and project
   memory "AI prompt .ts vs .md").
2. **Silent registry drift.** Nothing checked that the refs the prompt tells the
   model to use still resolve. A ref renamed in the registry (or a typo) only
   surfaced as a failed recipe at publish/hydrate time — per
   [0017](0017-recipe-ref-resolution-fails-loud.md), loud but late.

## Decision

A generated-content source that names registry refs — the AI system prompt is
the first — must:

- **Live as a typed constant co-located with the package that consumes it.** No
  cross-package runtime file reads, no I/O-based loading, no silent fallback.
- **Be guarded by a test that asserts every ref it emits resolves through the
  live resolver** (`getRegistryItem`, which checks the builtin catalog then the
  registry — the same path production uses), and that no banned/migrated ref
  form reappears.

The registry remains the sole home for builtin definitions
([0018](0018-registry-is-sole-home-for-builtin-definitions.md)); this decision
governs how *content that references* those definitions is stored and verified.

## Consequences

- Prompt edits are ordinary code review with a CI guard; a rename in the
  registry that the prompt misses fails the build, not a user's form.
- The prompt's wording must keep ref tokens unambiguous — negative examples are
  written as bare keys (`the key is \`national-id-number\`, NOT \`national-id\``)
  rather than `components/...` so the guard's extractor can stay strict without
  special-casing.
- Runtime-injected refs (e.g. DB custom components appended by `routes/ai.ts`)
  are out of the static guard's scope by design; only the embedded constant is
  pinned.
- New prompt-like artifacts that name registry refs inherit this requirement:
  embed + guard, don't load-and-hope.
