# AI Form Builder Move — Implementation Session

**Date:** 2026-05-20  
**Branch:** `platform/merge-builders`  
**Plan:** `docs/superpowers/plans/2026-05-20-ai-form-builder-move.md`  
**Spec:** `docs/superpowers/specs/2026-05-20-ai-form-builder-move-design.md`  
**Decision:** `docs/decisions/0003-form-authoring-lives-in-form_builder.md`

## What was built

The AI form builder — previously a NestJS module in `apps/api/src/form-builder/` plus a chat UI page in `apps/forms/src/routes/admin/form-builder.tsx` — was lifted and shifted into `apps/form_builder/`, the same TanStack Start app that already hosted the manual visual builder. `/builder` is now a landing chooser; `/builder/ui` is the manual builder; `/builder/ai` is the AI chat builder. The NestJS module and the forms admin page were deleted.

The work was scoped as a faithful behavioral port, not a rewrite. Error message strings, recipe-extraction strategies, publish-validation logic, and the Anthropic/Bedrock provider switch are all byte-equivalent to the originals — the chat UI greps the error message text for substrings like `"not found"` and `"No recipe"`, so divergence would have been a silent breakage. The only intentional behavioral differences:

- PDF upload moved from multipart `FormData` over CORS to base64-in-JSON over a same-process server function call. Wire format is ~33% larger but the binary stays out of the multipart layer entirely.
- The NestJS `Logger.log()` info lines (e.g. `"System prompt loaded..."`) were dropped; `Logger.warn()` calls for missing SDKs became `console.warn()`.
- The error message for an unconfigured AI service is now `"AI service not configured. Set ANTHROPIC_API_KEY."` (vs the original's `"AI service not initialized. Check configuration."`).

## Key implementation decisions

### TanStack Start serializer forced `Record<string, unknown>` → `Record<string, any>`

The plan called for the recipe shape to be typed as `Record<string, unknown>` throughout — the safer choice. When the new server functions in `sessions.ts` were first written and type-checked, TanStack Start's `ValidateSerializableMapped` validator rejected `Record<string, unknown>` with five errors of the form *"Type may not be serializable"*. The validator recurses into each value of a `Record` and treats `unknown` as un-provably-serializable.

The narrowest fix was widening to `Record<string, any>` in five places (`types.ts`, `session-store.ts`, `recipe-extractor.ts`, `sql-builder.ts`, plus one inline cast in `sessions.ts`). A tighter alternative would have been to introduce a proper `Recipe` interface, but the AI builder handles in-progress, partially-formed recipes during the chat loop — a strict type would have been a lie about the runtime invariant. `forms.ts`'s `ServiceContractRecipe` is the right type for *published* recipes, not for the chat-loop intermediate state.

This is a constraint future work should know about: any TanStack Start server function that returns a structurally-typed JSON object should use `any` for unknown-shape values, or define a concrete interface.

### Routes restructured before the AI route was added

`/builder/ui` is one level deeper than `/builder` used to be. The manual builder's `index.tsx` plus 15 dash-prefixed sibling files were moved via `git mv` so file-rename history is preserved (93–100% similarity reported by git). Import paths going up to `server/`, `styles/`, `lib/` were bumped from `"../../X"` to `"../../../X"` via a `sed` script, then spot-checked with `grep -n '"\.\./\.\./[^.]'` to catch anything the regex missed.

### Manual smoke test was the gate before deletions

Tasks 1–12 added the new code without touching the old paths. The plan designates Task 13 as a manual end-to-end smoke test that required a running Postgres + `ANTHROPIC_API_KEY` — work the AI can't do for the user. The session paused there for the user to verify the full publish flow (chat → recipe → publish → form appears in the manual builder's picker → delete → form disappears) before Tasks 14–15 deleted `apps/api/src/form-builder/` and `apps/forms/src/routes/admin/`.

### prettierignore added for routeTree.gen.ts

Throughout the session, `apps/form_builder/app/routeTree.gen.ts` kept showing as modified after commits — the husky pre-commit hook prettier-formats staged files into double-quote+semicolon style, but the TanStack Router plugin regenerates the file in single-quote+no-semicolon style on every dev/build invocation. The drift was cosmetic but recurring. Resolved by adding `**/routeTree.gen.ts` to `.prettierignore`, making the plugin's native output canonical. (The file's own header already says *"you should also exclude this file from your linter and/or formatter"* — the convention just hadn't been wired up yet.)

## Architecture / structure changes

**New:**

```
apps/form_builder/app/
├── routes/
│   └── builder/
│       ├── index.tsx              (landing chooser)
│       ├── ui/                    (manual builder, moved one level deep)
│       └── ai/index.tsx           (AI chat UI, ported from apps/forms admin page)
└── server/
    └── ai-builder/
        ├── types.ts
        ├── session-store.ts       + spec
        ├── ai-client.ts           (Anthropic + Bedrock, lazy singleton)
        ├── recipe-extractor.ts    + spec
        ├── sql-builder.ts         + spec
        ├── sessions.ts            (9 TanStack server fns)
        └── prompts/
            ├── system-prompt.md
            └── system-prompt.ts
```

**Deleted:**

- `apps/api/src/form-builder/` (entire module, ~2000 lines)
- `apps/forms/src/routes/admin/form-builder.tsx` (501 lines)
- `apps/api/src/app.module.ts` — `FormBuilderModule` import + array entry
- `apps/api/src/config/env.validation.ts` — `AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY` Joi entries
- `apps/api/package.json` — `@anthropic-ai/sdk` and `@aws-sdk/client-bedrock-runtime` (now exclusively in `apps/form_builder`)
- `apps/form_builder/docs/issues.md` (was already empty per a previous commit; cleaned up here)

## Testing

Three new Jest suites in `apps/form_builder/app/server/ai-builder/`: `recipe-extractor.spec.ts` (6 cases covering each extraction strategy + null + missing-field rejection), `sql-builder.spec.ts` (3 cases), `session-store.spec.ts` (5 cases). Existing `-recipe-reducer.spec.ts` continues to pass after the route move. Final run: 38/38 pass in form_builder, 329/329 pass in api.

The AI client itself has no unit tests — it talks to external APIs, and Task 13's manual smoke test covers it end-to-end.

## What was NOT done (deferred)

The spec explicitly defers these and the session honored that scope:

- Session persistence across server restarts (sessions remain in-memory in a single Node process — same constraint as today).
- Auth on `/builder/*`.
- Unification of the AI builder's immediate-publish flow with the manual builder's draft → publish flow. Both currently coexist.
- Renaming `apps/forms/src/lib/form-builder/` (a runtime form-rendering library, unrelated to authoring tooling but named confusingly).

## Pre-existing items left in place

- The `// Increase body size limit for form-builder PDF uploads` comment at `apps/api/src/main.ts:19`. The body-size limit itself is still useful for unrelated routes; the comment is non-load-bearing. Plan permitted leaving it.
- `apps/forms/src/lib/form-builder/` (runtime helper library — out of scope).
