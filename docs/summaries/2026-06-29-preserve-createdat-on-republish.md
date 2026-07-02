# Preserve `createdAt` on recipe re-publish (#1720)

## Context

Issue [#1720](https://github.com/govtech-bb/gov-bb/issues/1720): publishing an
edited recipe through the form builder rewrote **both** `createdAt` and
`updatedAt` to the publish timestamp. Evidence was PR #1671 — a one-label edit
whose diff also jumped `createdAt` from `2026-06-17` to `2026-06-25`. The
original creation date was being lost on every edit, and `createdAt` churned in
every publish diff. Expected: first publish stamps both; re-publish preserves
`createdAt` and advances only `updatedAt`.

Worked from `docs/plans/1720-preserve-createdat-on-republish.md` in worktree
`preserve-createdat-1720` (branch targets `sandbox`).

## What we did

- **New shared helper `createdAtFromContents(body)`** in
  `packages/git-publish/src/index.ts` — decodes the base64 `content` from a
  GitHub Contents API response, `JSON.parse`s it, and returns the recipe's
  `createdAt` (or `undefined`).
- **Both publish paths** now read that committed `content` (they already fetched
  the same response for its `.sha`), and graft the preserved `createdAt` onto
  the outgoing recipe before `JSON.stringify`:
  - `apps/form_builder/app/server/publish.ts` — the TanStack server fn (the
    Deploy UI path that produced #1671). The helper is re-exported through
    `app/server/github.ts`, matching the existing `authHeaders`/`ghError` facade
    pattern.
  - `apps/form_builder_api/src/routes/publish.ts` — the `POST /builder/publish`
    Express route, importing the helper directly from `@govtech-bb/git-publish`.
- **Tests (TDD):** helper branch coverage in `git-publish/src/index.spec.ts`
  (valid content, no content, bad JSON, missing/non-string `createdAt`), plus
  re-publish-preserves and first-publish-mints cases in both publish specs.
- `serializeRecipeDraft` was **not** touched.

## Why it looks this way

- **Preserve at publish time, anchored to the committed file — not editor
  state.** The rejected alternative was to thread the loaded recipe's
  `createdAt` through the reducer/editor state into `serializeRecipeDraft`.
  `RecipeDraft` deliberately carries no timestamps (`deserializeRecipe` discards
  them), so that path needs new editor-state plumbing and is only as trustworthy
  as the in-memory draft. Reading the committed artifact at publish makes the
  canonical on-disk file the single source of truth for `createdAt` — and
  `serializeRecipeDraft` can keep stamping both, because `createdAt` is
  authoritatively overridden afterward.
- **One shared helper, not two local copies.** The plan left this open (local
  per-path vs shared in `git-publish`). Shared won because both paths already
  import `git-publish` and both run in Node — `Buffer` is available in both, and
  `git-publish` already uses it — so there's no new dependency and no Dockerfile
  symlink risk (the #1400 hazard). The decode logic gets one focused unit test
  instead of being duplicated and tested twice.
- **Graft only the file write, not the draft save.** The server-fn path also
  `PUT`s the draft to `/builder/forms/:formId` earlier in the flow. That save is
  left untouched: `deserializeRecipe` never reads timestamps back into a draft,
  so the draft store's `createdAt` never round-trips into a future publish. The
  committed file is the only place `createdAt` is authoritative, so that's the
  only place the graft is needed.
- **`undefined` fallback == first-publish behaviour.** When there's no existing
  file (404), no inline content, unparseable content, or no string `createdAt`,
  the helper returns `undefined` and the recipe is written verbatim with its
  freshly-minted stamps — exactly what a first publish should do.

## What we almost shipped wrong

The full build regenerated `apps/forms/src/routeTree.gen.ts` (quote-style churn,
double→single quotes) — an unrelated generated-file artifact. Caught it in the
diff review and reverted it so the commit stays surgical.

## Open questions

- **`>1MB` recipes silently re-mint `createdAt`.** GitHub omits inline `content`
  from the Contents API for files over 1MB, so the helper returns `undefined`
  and a re-publish would re-stamp `createdAt` — the #1720 bug reappearing at the
  size boundary. Documented in the helper as intentional; recipe JSON is
  KB-scale today, so the blob-API fallback was deliberately not built. Revisit
  only if a recipe ever approaches that limit.
- `POST /builder/publish` (form_builder_api) may be vestigial vs the server-fn
  path. Fixed both regardless; not investigated which the live UI calls.
