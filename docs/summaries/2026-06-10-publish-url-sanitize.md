# Sanitize user values in publish.ts GitHub API URLs (#935)

## Context

CodeQL flagged two `js/request-forgery` alerts in
`apps/form_builder_api/src/routes/publish.ts`
([#935](https://github.com/govtech-bb/gov-bb/issues/935)) — user-provided recipe
values (`formId`, `version`) were interpolated into GitHub API request URLs:
the recipe-file contents `PUT` path (`:104`) and the cleanup-branch `DELETE`
path (`:138`).

The practical blast radius was already bounded — the host is hardcoded
(`api.github.com/repos/govtech-bb/gov-bb`), the call uses the caller's
repo-scoped token, and `formId` was already kebab-validated upstream — so this
is path-injection on a fixed host, not SSRF. But the pattern was worth
hardening, and one input was genuinely under-validated.

Resolved on `publish-url-sanitize-935` (targets `sandbox`).

## What we did

Defence-in-depth: validate the input *and* sanitize at the sink.

- **`version` validation** (the real gap). It was bare `z.string()` in both
  `serviceContractSchema` and `serviceContractRecipeSchema` — no semver rule
  anywhere in the repo. Added `packages/form-types/src/version-pattern.ts`
  (`SEMVER_PATTERN = /^\d+\.\d+\.\d+$/`, `SEMVER_ERROR`, `semverSchema`),
  mirroring `id-pattern.ts`, applied to `version` in both schemas and exported
  from the barrel. A non-semver version now fails `validateRecipeFully` and
  returns 400 *before* any GitHub call.
- **Sink encoding** in `publish.ts`:
  - Contents `PUT` path — `encodeURIComponent` on each user segment, keeping the
    structural `/` literals between them.
  - Cleanup `DELETE` path — encode the branch **per path segment**
    (`branch.split("/").map(encodeURIComponent).join("/")`), not the whole
    string.
- **Tests**: `version-pattern.spec.ts` (accept `1.2.0`; reject `latest`, `1.2`,
  `v1.2.0`, prerelease); barrel re-export coverage in `index.spec.ts`; and
  `publish.spec.ts` cases for the encoded `PUT` URL, the working `DELETE`
  cleanup URL on a forced `PUT` failure, and the non-semver → 400 rejection.

## Why we did it that way

- **Both validation and sink encoding, not either.** `encodeURIComponent` at
  the sink is the dependable CodeQL clear, but leaves `version` semantically
  unvalidated (a junk version still opens a PR / writes a weird path). The
  semver guard closes the real gap and is symmetric with how `formId` is already
  kebab-guarded. CodeQL doesn't reliably recognise a zod `.regex()` two
  function-hops upstream as a sanitizer, so the sink encoding stays as the
  durable clear.
- **Per-segment encoding on the DELETE branch — not whole-string.** The first
  cut (and the original plan) used `encodeURIComponent(branch)`. But
  `branch = form-builder/<formId>-<version>-<ts>` carries a **structural**
  slash, and GitHub matches `DELETE /git/refs/{ref}` by literal path segments —
  whole-encoding turns that `/` into `%2F`, 404s the cleanup, and orphans the
  branch on every failed publish. A code review caught this; the fix encodes
  each segment so the slash survives. For valid input the encoding is a no-op
  (kebab formId + semver version + `Date.now()`, all dot-stripped) — it only
  neutralises injected path characters for the analyzer and malformed input.
- **Left `deployBranchName` alone.** It stays dash-sanitizing (`.` → `-`);
  encoding happens at the URL sink, not in the shared helper, so the Deploy/Erase
  branch-naming convention is untouched.
- **No consumer breakage from tightening `version`.** Every contract/recipe that
  is actually `.parse()`d at runtime (recipe JSONs, example/master contracts, API
  fixtures) already uses plain `X.Y.Z`. The stray `version: "1"` literals are
  `FormMeta`/webhook payloads or type-only `as ServiceContract` casts that never
  hit the schema.
- **Barrel-coverage gate.** A new `form-types` export adds re-export getter
  functions in `index.ts` that only count as covered when exercised *through*
  the barrel — so the new symbols are imported in `index.spec.ts`, not just the
  direct `version-pattern.spec.ts`, keeping the 98% function-coverage gate green.

## Out of scope

- The `js/missing-rate-limiting` alerts on this service (accepted risk,
  ADR 0042 / #874).
- The other constant-only `fetch` URLs in `publish.ts` (not user-tainted).
- After merge: confirm both CodeQL alerts (publish.ts:104, :138) clear on the PR
  scan.
