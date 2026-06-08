# 0042 — Contract validation gates at publish, not at draft writes

**Date:** 2026-06-08
**Status:** Accepted

## Context

Issue #759 observed that the form_builder_api **write** endpoints
(`createFormHandler` / `updateFormHandler` / `rekeyFormHandler` in
`apps/form_builder_api/src/routes/forms.ts`) persist a recipe to the
`form_definitions` table without ever running `validateFormContract` — only
`POST /builder/registry/validate` does. The issue proposed closing the gap by
adding the contract check to all three write handlers.

That fix was rejected, because three facts make write-time hard validation the
wrong layer:

- **Save-invalid-drafts is a deliberate feature.** The builder lets an author
  save a contract-invalid draft after an explicit confirm ("Save it as a draft
  anyway so others can review it?"). A write-time contract gate would break
  that flow.
- **DB drafts never serve production.** `form-definitions.service.ts` forces
  `RECIPE_SOURCE=files` outside `NODE_ENV=development`, so an invalid draft row
  physically cannot reach end users.
- **Production is already gated.** CI's `validate-recipes` job runs
  `serviceContractRecipeSchema` + ref guards over every recipe file on the PR
  and fails the merge on any violation.

The only real residual gap was **fail-fast at publish**: `POST /builder/publish`
wrote the recipe to GitHub and opened a PR with no server-side validation,
trusting the client's Deploy gate. A direct API call, a buggy client, or a
stale tab could bypass that gate and open a junk PR that only exists to burn a
CI cycle.

## Decision

Full form-contract validation is enforced at the **publish / production
boundary**, never at the draft-write endpoints.

1. **`/builder/publish` is the server backstop.** It runs the shared
   `validateRecipeFully` helper (schema + recipe-wide id-collision +
   unknown-ref checks — the same three layers `/builder/registry/validate`
   runs) at the top of the handler and returns `400 { error, issues }` before
   any GitHub call, so a failed validation leaves no branch or PR behind.
2. **The write endpoints stay lenient by design.** `createForm` /
   `updateForm` / `rekeyForm` must **not** gain a `validateFormContract` call.
   They persist drafts, and saving a contract-invalid draft is a supported
   action. The DB never serves production (`RECIPE_SOURCE=files`), so it needs
   no contract gate.
3. **CI guards the merge.** `validate-recipes` remains the gate that keeps an
   invalid recipe out of `dev`/prod regardless of how it was authored.

`validateRecipeFully` is the single shared implementation so the `/validate`
client gate and the `/publish` backstop cannot drift.

## Consequences

- A future request to "validate the write endpoints" should be declined on the
  same grounds — point at this record. The fix for a junk-PR or
  invalid-recipe-reaching-prod concern is the publish backstop plus CI, not a
  write-time gate.
- The client Deploy-gate validation stays: it is what stops normal users from
  opening junk PRs in the first place. The server backstop sits behind it for
  non-UI / stale / buggy clients.
- This sits alongside ADR 0007 (runtime recipes load from files, not the
  `form_definitions` table) — that decision is *why* DB drafts are safe to
  leave unvalidated, and ADR 0010 — the recipe-wide id-uniqueness and
  unknown-ref checks are catalog-dependent, which is why they live in the
  shared helper rather than in `validateFormContract`.
