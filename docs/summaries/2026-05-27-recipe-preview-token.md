# Per-request DB recipe preview via a secret token

## Context

Issue [#219](https://github.com/govtech-bb/gov-bb/issues/219). After ADR-0007 made files the only runtime recipe source on end-user paths, operators lost the ability to preview an **unpublished** `form_definitions` draft against a real deployment. This session added that back as a narrow, secret-gated exception — without reopening the #145 leak. Implemented from `docs/plans/recipe-preview-token.md` on branch `feat/recipe-preview-token` (merges into `sandbox`).

## What we did

- **API:** `RECIPE_PREVIEW_TOKEN` env (default `""`); a per-request `preview` flag threaded controller → `findByFormId` → `getRecipe`; `X-Recipe-Preview` header + constant-time compare in the controller; `Cache-Control: no-store` on validated-preview responses only. New `recipe-preview-token.ts` helper. Commits `d74fed4`, `b65529c`, `7405d79`.
- **Forms:** `?preview=` search param → route `loaderDeps` → `contractQueryOptions` → `fetchContract`/`fetchFormDefinition` (sends the header) → both query-cache tiers keyed by the token. Commits `2d1c7ec`, `ef41182`, `b14d56a`, `a23a9c7`, `0bb3415`.
- Decision recorded in **ADR-0011** (the bounded-exception principle). Not restated here.

## Why we did it that way

- **Header, not query param (deviates from the issue title).** The issue said "query param." We send the forms→API hop as the `X-Recipe-Preview` header instead, so the token stays out of API access logs, CDN/reverse-proxy logs, `Referer`, and OTEL URL spans. The token still appears in the operator's browser URL — that exposure is inherent and accepted (rotate via the env var; treat preview links as secrets) — but the header protects the shared-logging hop, which is the bigger risk.
- **Reused `getRecipe`'s existing `both` branch rather than DB-only.** `both` falls back to the published file when no draft exists, so a preview link degrades gracefully. The cost is a semver pitfall: with no `?version=`, a draft whose version is *lower* than the published file is shadowed. We chose to **document the `?version=<draftVersion>` workaround** rather than special-case preview to prefer DB unconditionally — revisit if it bites operators in practice.
- **Fail-closed by construction.** The compare is `timingSafeEqual` over SHA-256 digests (fixed 32-byte length → no length leak, no throw on mismatch), and an empty `RECIPE_PREVIEW_TOKEN` short-circuits to `false` *before* any compare, so there's no `"" === ""` match. The `preview` flag has exactly one writer: a successful compare. We did **not** mutate `source()` — the server-wide ADR-0007 gate stays intact; preview is purely per-request.
- **Throttle left as-is.** The existing controller throttle (20/10s, 120/60s) is an adequate brute-force ceiling against a high-entropy secret; a preview-specific limit would add complexity for no real gain.

## What we almost got wrong

The plan said to fold preview into "the TanStack Query cache key" — singular. We did, in the **Tier-1** contract cache. But the forms app has a **two-tier** cache, and the **Tier-2 `FormMeta` cache** (`staleTime: Infinity`) keys only on `[formId, version]`. The primary use case is previewing an in-progress draft that still carries the *same version string* as the published file — so previewing once, then opening the untokened URL, would hit the cached **draft** FormMeta and render it on a no-token URL (within the operator's own browser; it's a client-only SPA, so not cross-user). A per-task reviewer couldn't see this — it only emerges when the slices combine, and a whole-feature end-to-end review caught it. Fix (`0bb3415`): a shared `normalizePreviewToken` helper and the token folded into **both** cache-key tiers.

**Invariant for future work on `form-query.ts`:** any per-request recipe variant must be keyed into *every* cache tier, not just the one nearest the network call. It's now enforced by code, comments, and a regression test asserting preview vs. no-preview keys differ at the same version.

## Open questions

- **Manual real-browser smoke test still pending** — needs a deployment with a DB draft and `RECIPE_PREVIEW_TOKEN` set (open `?preview=<token>` → draft; no token → published; bad token → published). Not reproducible locally without that setup.
- The `both` lower-semver shadowing (above) is documented, not solved. Revisit only if operators hit it.
