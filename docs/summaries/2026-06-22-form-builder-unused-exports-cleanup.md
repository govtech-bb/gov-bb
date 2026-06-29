# form_builder unused-exports cleanup (DEAD-09 / #1417)

## What

Reduced public-surface cruft in `apps/form_builder` — the largest slice of the
DEAD-09 audit. Of the 27 symbols knip flagged (23 exports + 4 types), **14 were
genuinely actionable** and **13 were false positives** that stay exported.

## Why it looks the way it does

### knip over-reports on a TanStack Start app
Running `pnpm dlx knip --workspace apps/form_builder --exports` with no knip
config treats the TanStack route files (`routes/**/*.tsx`, `auth/*.tsx`, and the
colocated `-*.tsx`/`-*.ts` files) as **unreachable** — they aren't conventional
entry points, so knip doesn't follow their imports. The result: symbols that are
genuinely consumed by route files (`VISIBILITY_LEVELS`, `listLandingContentPages`,
`publishStartPage`, `getRepoDisplay`, `getGitHubOAuthCreds`, `setSession`, the
OAuth cookie serializers, `clearSession`, the content `EditorState`, etc.) get
reported as unused. Each of the 13 residual findings was grep-verified to have a
real consumer and **left exported** — removing them would break the build. This
is why the plan's "triage, don't bulk-delete" warning mattered: a naive deletion
pass would have broken auth and the content editor.

### Down-scope vs delete
- **Down-scoped** (dropped `export`, symbol used only within its own file, zero
  behaviour change): `NO_FIELDS_STEP_IDS`, `SUBMISSION_CONFIRMATION_STEP_ID`
  (`-recipe-reducer.ts`); `ApiTimeoutError` (`api-client.ts`, thrown internally);
  `OAUTH_STATE_COOKIE_NAME`, `OAUTH_STATE_TTL_SECONDS` (`session.ts`);
  `ConvertResponse` (`ai-builder/types.ts`, used by the exported status unions).
- **Deleted** (zero consumers anywhere): `useFieldRefs`/`useStepRefs` hook
  wrappers (`-recipe-refs.ts`; the underlying `getFieldRefs`/`getStepRefs` stay,
  heavily used) + the orphaned `useMemo` import; `EditRequest` type (the
  `startEditRecipe` handler inlines its own zod schema); the `MdaContactAddress`
  re-export from the app's type barrel (the app uses `MdaContact` /
  `CreateMdaContactInput`, not this one).

### The four dead server functions — a judgment call
`deleteFormVersion` (`forms.ts`), `getRegistryItemFn` + `getBuilderMetadata`
(`registry.ts`), and `getAiStatus` (`ai-builder/convert.ts`) are `createServerFn`
endpoints with **zero callers**. Three of them (`getAiStatus`,
`getRegistryItemFn`, `getBuilderMetadata`) were also **documented in
`SPEC.md` §4** — the plan's "intentional API surface?" yellow flag. They were
deleted anyway because SPEC.md §4 is already demonstrably stale: it still
documents `convertRecipe` (a synchronous AI call that no longer exists — the
flow was replaced by the async `startEditRecipe`/`getEditStatus` job pipeline for
#1129). Documented-but-never-wired + zero callers ⇒ dead. SPEC.md §4 was updated
to drop the three deleted functions so docs match the live surface.

### Left alone (pre-existing, unrelated)
- `convertRecipe` in `SPEC.md:191` — describes the removed synchronous AI call;
  pre-existing drift, not this change's to fix.
- `convertRecipe: vi.fn()` in `index.spec.tsx`'s convert mock — mocks an export
  that doesn't exist; pre-existing stale mock cruft.

## Verification
- `nx run form-builder-app:build` ✓
- `pnpm exec tsc -b` exit 0 ✓ (catches removed types referenced in specs)
- `nx run form-builder-app:test` — 637 passed ✓
- knip re-run: **27 → 13**, residual 13 = the verified false positives

## Scope note
One PR per app (plan's structure). This is the form_builder slice only; landing,
chat, api, form_builder_api remain for follow-up PRs. The `forms` slice is
covered by #1413.
