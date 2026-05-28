# form_builder: append `?preview=<token>` to preview links

## Context

Implemented from `docs/plans/form-builder-preview-token-link.md` on branch
`form-builder/preview-token-link` (merges into `sandbox`).

When an author previews a form from the builder (`/builder/ui` submit modal and
`/builder/ai`), the "Preview form" link pointed at
`${origin}/forms/${formId}` with **no preview token**. The forms app reads
`?preview=<token>` and forwards it to the API as the `X-Recipe-Preview` header
to view an **unpublished DB draft**; with no token the API's
`isValidPreviewToken` rejects the empty value and the draft fails closed. So
previewing a draft from the builder never worked.

## What we did

- **`app/lib/form-url.ts`** — `joinFormPreviewUrl(baseUrl, formId, token)` gained
  a `token` arg and now appends `?preview=${encodeURIComponent(token)}`.
  `formPreviewUrl(formId)` reads `import.meta.env.VITE_RECIPE_PREVIEW_TOKEN`,
  defaulting to `"demo"` (new `DEFAULT_PREVIEW_TOKEN` const), then delegates.
  Both call sites (`-submit-modal.tsx`, `ai/index.tsx`) already call
  `formPreviewUrl(formId)` and inherited the token with no change.
- **`app/lib/form-url.spec.ts`** — every `joinFormPreviewUrl` case got the token
  arg; added a URL-encoding case (`"a b&c=d/e"` → `a%20b%26c%3Dd%2Fe`). The
  `formPreviewUrl` case now asserts the stubbed token.
- **`jest.config.ts`** — added `VITE_RECIPE_PREVIEW_TOKEN: "stub-token"` to the
  `ts-jest-mock-import-meta` env stub so the env-reader branch resolves.
- **`app/routes/builder/ui/-submit-modal.spec.tsx`** — the existing preview-link
  assertion now expects `…/forms/passport?preview=stub-token` (behavior change,
  not a regression). This file wasn't in the plan's file list but the link
  change required it.
- **`.env.example`** — documented (commented) `VITE_RECIPE_PREVIEW_TOKEN=demo`
  with the bundle-baked / OAuth-gated / must-match-API note.
- **ADR-0016** records the OAuth-gated-builder-may-VITE-bake principle.

## Why we did it that way

- **`VITE_` var, not server-only.** The link is built in the browser
  (`import.meta.env` per ADR 0005), so the token has to be `VITE_`-prefixed —
  which bakes it into the builder bundle. The public forms app deliberately
  declined this exposure, but the builder is GitHub-OAuth-gated, so the team
  accepted it for the simplicity of matching how `VITE_FORMS_URL` already works.
  The server-only-via-loader alternative was rejected as more machinery for no
  gain given the gate. See ADR-0016.
- **Always default to `"demo"`, param always present.** Chosen over
  "no token ⇒ no param" so the helper stays branch-free and the link is uniform;
  a link is always preview-capable in dev. (Confirmed with Isaiah during
  dev-start.)
- **`encodeURIComponent(token)`.** So a real rotated token with URL
  metacharacters survives intact; `"demo"` is unaffected.
- **Kept the pure-helper / env-reader split.** `joinFormPreviewUrl` stays the
  pure, exhaustively-tested unit; `formPreviewUrl` is the thin env reader whose
  default-branch coverage rides on the helper (import.meta replacement is static
  and can't be unset per-test).

## What we almost got wrong / drift from the plan

- The plan listed `apps/form_builder/.env` as a file to modify, but it
  **already** had `VITE_RECIPE_PREVIEW_TOKEN=demo` locally — and `.env` is
  gitignored, so it's not in the worktree or the commit. Only `.env.example`
  (committed) needed the documented var.
- `tsc -b apps/form_builder` reports two errors in `app/server/registry.ts`
  (TanStack server-fn serialization typing) — confirmed **pre-existing on base
  `sandbox`**, unrelated to this change. `form_builder`'s real type-check is via
  ts-jest diagnostics, which passed.

## Open questions

- **Manual browser smoke pending (Isaiah).** Build a draft, open the builder
  preview link, confirm the URL is `…/forms/<id>?preview=demo` and the
  unpublished draft renders via the forms app — requires the API's
  `RECIPE_PREVIEW_TOKEN=demo` locally for the default to unlock drafts
  end-to-end. That API-side config is out of scope here but the two must agree
  to be useful.
