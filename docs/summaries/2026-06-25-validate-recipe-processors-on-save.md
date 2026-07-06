# Validate recipe processors on form save (#281)

## Context

`apps/form_builder_api/src/routes/forms.ts` imported `serviceContractRecipeSchema`
but used it only as a TypeScript type: the POST/PUT save handlers did
`req.body.recipe as ServiceContractRecipe` (a compile-time cast, no runtime
check) and persisted the body to `FormDefinitionEntity.schema`. The submission
pipeline later runs the stored recipe, and `OpencrvsProcessor`/`WebhookProcessor`
`fetch` their configured `endpoint`/`url` — so an unvalidated recipe is a direct
SSRF / credential-exfil vector (e.g. an `endpoint` of
`http://169.254.169.254/...`). Worked from `docs/plans/281-validate-recipe-on-save.md`.

## What we did

- **Validate `recipe.processors` on save** (POST `createFormHandler`, PUT
  `updateFormHandler`) via a new `validateRecipeProcessors` helper. A malformed
  or malicious processor config returns **400 before any DB write**; the rest of
  the (possibly partial) recipe is left unvalidated so drafts still save.
- **Tightened the processor schemas** (`packages/form-types/processor.type.ts`):
  opencrvs `endpoint` and webhook `url` must be `https` to a non-internal host —
  a browser-safe static check (`isSafeExternalHttpsUrl`) that rejects literal
  private/loopback/link-local/CGNAT IPv4 and IPv6 ULA/link-local/loopback,
  notably the cloud-metadata `169.254.169.254`. Webhook dynamic-expression URLs
  (the JsonLogic branch) are unaffected.
- Tests: `forms.validate-on-save.spec.ts` (malicious processor / non-https → 400
  with no DB access; partial recipe still proceeds; valid recipe reaches the DB),
  plus URL-safety cases in `processor.type.spec.ts`.

## Why we did it this way

- **Validate processors only, not the whole recipe (the issue's suggestion #1
  fallback).** A first attempt at full `serviceContractRecipeSchema` validation
  broke **32 existing tests**: the save handlers legitimately receive *partial*
  recipes (fixtures with no `createdAt`/`updatedAt`/`steps`), so full validation
  would reject in-progress drafts. The actual vulnerability is the unvalidated
  `processors[]`, so we scope the gate to exactly that — closing the SSRF without
  changing the draft-save contract. (Decision confirmed with Shannon: approach B.)
- **`z.array(processorSchema)`, NOT the existing `processorsSchema`.** The
  in-file `processorsSchema` refines to *payment-only* (it guards the
  `form_config` sibling blob). The recipe's `processors[]` are the *non-payment*
  ones, so reusing it would reject every valid recipe — a bug caught mid-build.
  The helper carries a comment to stop the next person reusing the wrong schema.
- **Browser-safe static URL check (no `node:net`/`URL`).** `form-types` is bundled
  for the frontend too, so the host check is pure string parsing. It's the static
  layer; a hostname that *resolves* to an internal IP is the separate runtime
  fetch-time guard's concern (the #287 family).

## Scope held

- Out: the AI publish path (filed separately) and `rekeyFormHandler` (issue names
  only POST + PUT). No full-recipe validation. No runtime/DNS guard here.

## Verification

- `form-builder-api`: 238 passed; `form-types`: 426 passed + coverage gate met;
  both builds clean. The malicious-endpoint and non-https cases 400 with the DB
  mock never called; a partial recipe and a valid recipe both pass the gate.
