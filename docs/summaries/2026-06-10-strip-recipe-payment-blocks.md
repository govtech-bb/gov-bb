# Strip committed payment processors from recipe JSON (#750)

## What changed

Removed the `{ "type": "payment", ... }` processor element from the `processors`
array in **9** recipe files, leaving the `email` processors and the rest of each
recipe untouched:

- `get-birth-certificate` — 1.0.0, 1.1.0, **1.5.0**
- `get-death-certificate` — 1.1.0, 1.2.0
- `get-marriage-certificate` — 1.1.0
- `get-marriage-certificate-test` — 1.1.0
- `post-office-redirection-business` — 1.1.0
- `school-registration-fee` — 1.0.0

Pure deletion (124 lines, 0 added). No code changed — the hydration overlay,
builder save/read path, and blob schema all shipped with #716 (PR #762).

## Why

The committed payment blocks all shared one placeholder `paymentCode`
(`awR2Da5z7K`) and carried per-MDA routing values (payment code, department,
amount) that are environment-specific and should not live in source control —
same rationale as the #607 email recipients, and codified by ADR 0033
(*per-form DB config never enters the recipe*). The payment processor is now
sourced per-environment from `form_config.config.processors` at hydration
(`form-definitions.service.ts:127-152`).

## Ordering matters (DB-first, strip-second)

The hydration overlay only drops the recipe payment when the DB set already
contains one (`dbHasPayment ? filter : recipeProcessors`). Stripping a recipe's
payment before a `form_config` row exists hydrates the form with **no payment**
→ `requiresPayment` false → submittable for free. This PR's strip must therefore
lag the DB write in **every** environment that serves each form.

## Drift found mid-session — and an unresolved risk

The plan listed 8 files against an older checkout. The worktree based on
`origin/sandbox` revealed a **9th**: `get-birth-certificate/1.5.0` — now the
latest birth-cert version — also carried the block. It had been **restored the
same day** by commit `2f1e4337` ("restore EzPay payment on get-birth-certificate
v1.5.0"), because the form_builder Deploy flow republishes recipes serializing
only the processors it models (emails), silently dropping the committed payment,
so "the live form lost its payment step."

That restore is evidence the birth-cert `form_config` DB row **was not actually
charging** — if it were, the form would not have lost payment when 1.5.0
republished clean (DB payment makes `requiresPayment` true regardless of recipe
version). This contradicts the "both envs confirmed" premise.

Two of the stripped versions (`get-birth-certificate/1.5.0`,
`school-registration-fee/1.0.0` — its only version) are the **latest/live**
versions, not stale pinned copies. The decision (Isaiah) was to strip all
regardless, treating the DB rows as authoritative.

**Before this PR merges:** independently verify each form's prod + sandbox
`form_config.config.processors` actually carries a payment (fetch the submission
contract, confirm `requiresPayment: true` with the real code/amount, not
`awR2Da5z7K`). Otherwise birth-cert and school-registration go free.

The builder Deploy flow dropping payment processors on republish is a separate
latent bug worth its own issue.

## Verification

- `grep -rn awR2Da5z7K apps/api/src` → none; no `"type": "payment"` left in any recipe.
- All 9 files valid JSON.
- `nx run api:test --skip-nx-cache` → 770 passed (exercises the recipe loader + `serviceContractRecipeSchema`).
- `tsc -b apps/api` → clean.
