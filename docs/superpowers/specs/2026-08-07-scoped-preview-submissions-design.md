# Scope preview submissions to named forms — design

Date: 2026-08-07
Status: Approved (design), pending implementation plan
Related: ADR 0065 (superseded by new ADR 0066), ADR 0043, #1682, #1646

## Context

`ALLOW_PREVIEW_SUBMISSIONS` (ADR 0065) is an all-or-nothing environment switch.
When it is `"true"`, `SubmissionsController.create` sets `bypassVisibility` on
**every** submission, so **every** non-public published-file recipe on that
environment becomes submittable without a token.

That is broader than the need it was introduced for. ADR 0065 was written to
exercise one feature-flagged form — `apply-for-temporary-restaurant-licence`
(`meta.visibility: "draft"`) — end to end on sandbox and staging. The flag
instead unlocks the submit path for every form gated by `meta.visibility` or by
a `service_status` row, including forms deliberately hidden for reasons
unrelated to testing. ADR 0065 already recorded the residual risk: "anyone who
can reach a sandbox/staging API can submit its non-public forms."

Narrowing the flag to a named set of forms keeps the testing capability and
removes the collateral exposure.

Unchanged by this work:

- **ADR 0043 / #145** — `bypassVisibility` does not touch the recipe *source*.
  `resolveRecipe` still forces `files` outside dev, so a DB-only builder draft
  resolves to `null` → 404 → the ADR 0043 400 ("This recipe is an unpublished
  preview and cannot be submitted"). DB drafts stay unsubmittable.
- **#1682** — the per-request `X-Recipe-Preview` token path keeps working for
  any form, allowlisted or not. It is already secret-gated.

## Decision

Replace the boolean with **`PREVIEW_SUBMISSION_FORM_IDS`**, a comma-separated
allowlist of form IDs. A submission bypasses the visibility gate when its
`formId` is in that list, or when it carries a valid `X-Recipe-Preview` token.
Empty (the default) means no environment-level bypass at all.

The blanket behaviour is removed outright — there is no `*` wildcard and no
`"true"` alias. Reintroducing "all forms" would reintroduce the problem this
change exists to fix.

## Implementation

### 1. `apps/api/src/config/env.validation.ts`

Delete the `ALLOW_PREVIEW_SUBMISSIONS` field (currently lines 134–139) and add
in its place:

```ts
// Comma-separated form IDs whose non-public *published file* recipe may be
// submitted without a per-request X-Recipe-Preview token, so a feature-flagged
// form can be tested end-to-end. Empty (default) disables the bypass — leave
// unset in production. DB-only builder drafts stay unsubmittable regardless
// (ADR 0043 / #145). Replaces the blanket ALLOW_PREVIEW_SUBMISSIONS boolean.
// See ADR 0066.
PREVIEW_SUBMISSION_FORM_IDS: z.string().default(""),
```

`z.string()`, not an enum or a refined list: the schema cannot know which form
IDs exist at boot (recipes resolve at runtime from files), and an ID that
matches no recipe simply never fires the bypass, so there is nothing to guard
against. No boot-time validation of membership.

The schema ends in `.passthrough()`, so a stale `ALLOW_PREVIEW_SUBMISSIONS`
still present in a deployed task definition is accepted and ignored rather than
failing the boot gate. This is deliberate — ADR 0061 records that a hard
boot-time env requirement crash-loops ECS.

### 2. `apps/api/src/forms/submissions/submissions.controller.ts`

`body.formId` is already on `CreateSubmissionDto` (line 68), so no new plumbing.
Replace the `allowPreviewSubmissions` / `bypassVisibility` block (lines 49–63)
with:

```ts
// PREVIEW_SUBMISSION_FORM_IDS names the forms whose non-public *published file*
// recipe may be submitted without a per-request token, so a feature-flagged
// form can be tested end-to-end on sandbox/staging (ADR 0066). Any other form
// still needs a valid X-Recipe-Preview token. Empty list → no bypass, which is
// production's posture. DB-only builder drafts stay unsubmittable either way
// (ADR 0043 / #145).
const previewSubmissionFormIds = this.configService
  .get<string>("PREVIEW_SUBMISSION_FORM_IDS", "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const bypassVisibility =
  previewSubmissionFormIds.includes(body.formId) ||
  isValidSecretToken(
    this.configService.get<string>("RECIPE_PREVIEW_TOKEN", ""),
    previewToken,
  );
```

Parsed per request rather than cached on the instance. This matches the
surrounding `configService.get` style in the same method, keeps the existing
spec's `config.get.mockImplementation` ergonomics, and splitting a short string
per submission is not a measurable cost.

Everything downstream is untouched: `bypassVisibility` threads through
`submissionsService.submit` → `submission-pipeline.service.ts` →
`formDefinitionsService.findByFormId` → the #1646/#1896 launch gate in
`form-definitions.service.ts:367`. The blast radius stays exactly where #1682
put it.

Add the stale-variable warning as a constructor side effect, so it logs once at
boot and not per request. `Logger` is not currently imported in this file — add
it to the existing `@nestjs/common` import. Follow the established field
convention
(`private readonly logger = new Logger(X.name)`, as in
`payment-return.controller.ts:26`):

```ts
private readonly logger = new Logger(SubmissionsController.name);

constructor(
  private readonly submissionsService: SubmissionsService,
  private readonly configService: ConfigService,
) {
  if (this.configService.get<string>("ALLOW_PREVIEW_SUBMISSIONS")) {
    this.logger.warn(
      "ALLOW_PREVIEW_SUBMISSIONS is set but no longer read — preview " +
        "submissions are now scoped per form via PREVIEW_SUBMISSION_FORM_IDS " +
        "(ADR 0066).",
    );
  }
}
```

### 3. `apps/api/.env.example`

Replace the `ALLOW_PREVIEW_SUBMISSIONS` block (lines 65–70) with a
`PREVIEW_SUBMISSION_FORM_IDS` block documenting the comma-separated format, that
empty means the bypass is off, that it reaches published-file recipes only, and
that production leaves it unset.

### 4. New ADR `docs/decisions/0066-preview-submissions-are-scoped-to-named-forms.md`

Supersedes ADR 0065; 0065 stays in place as history with its status updated to
note the supersession. The new ADR records:

- Why the blanket switch was too broad (every gated form on the environment,
  not just the one under test).
- The replacement: an explicit per-form allowlist, no wildcard, empty default.
- That ADR 0043's DB-draft prohibition and #1682's token path are both
  unaffected.
- That the gate remains environment configuration rather than a per-request
  secret — anyone who can reach sandbox/staging can still submit the *named*
  forms. That residual risk is accepted and is now bounded to those forms.

### 5. Tests — `apps/api/src/forms/submissions/submissions.controller.spec.ts`

Rewrite the `preview-submission env flag (ALLOW_PREVIEW_SUBMISSIONS)` describe
block (line 362) as `preview-submission allowlist (PREVIEW_SUBMISSION_FORM_IDS)`:

1. `formId` present in the list → `submit` called with `bypassVisibility: true`,
   no preview token supplied.
2. `formId` absent from a non-empty list → `bypassVisibility` falsy.
3. Empty/unset variable → falsy for any `formId`.
4. Multi-ID list with stray whitespace (`"form-a, form-b"`) → both IDs match.
5. Valid `X-Recipe-Preview` token on a **non**-allowlisted form → still
   bypasses. Guards the #1682 path against regression.
6. Stale `ALLOW_PREVIEW_SUBMISSIONS="true"` with an empty allowlist → falsy
   (the retired variable grants nothing).

The existing `X-Recipe-Preview` describe block above it must keep passing
unchanged; several of its cases use `config.get.mockReturnValue(...)`, which now
also feeds `PREVIEW_SUBMISSION_FORM_IDS` — confirm the returned value does not
accidentally match `baseDto.formId`, and switch those to `mockImplementation`
keyed on the variable name if it does.

Verify: `pnpm exec nx run api:test`, then
`pnpm exec nx run-many -t build --exclude=landing`.

## Deployment

The sandbox and staging ECS task definitions are managed in AWS, not in this
repo, so code and configuration deploy independently. After this merges, both
need:

```
PREVIEW_SUBMISSION_FORM_IDS=apply-for-temporary-restaurant-licence
```

and the removal of `ALLOW_PREVIEW_SUBMISSIONS`.

Between the code deploy and that edit, preview submissions are **off** on
sandbox and staging: a submission to `apply-for-temporary-restaurant-licence`
404s on the files path, the draft-sourced guard in
`submission-pipeline.service.ts` re-finds the recipe, and the caller gets the
ADR 0043 **400** — "This recipe is an unpublished preview and cannot be
submitted." (Not a 404; that is the pre-ADR-0065 behaviour described in 0065's
own context section.) This fails closed, which is the safe direction, and the
boot warning names the cause in CloudWatch. Call it out as a release note in the
PR description.

Production is unaffected — it never set `ALLOW_PREVIEW_SUBMISSIONS`, and the new
variable defaults to empty.

## Success criteria

- A submission to `apply-for-temporary-restaurant-licence` succeeds on an
  environment where that ID is listed, with no `X-Recipe-Preview` header.
- A submission to any other non-public form on that same environment is
  rejected exactly as it is today with the flag off.
- A valid `X-Recipe-Preview` token still submits any non-public published form.
- A DB-only builder draft is still rejected with the ADR 0043 400, in every
  configuration above.
- `pnpm exec nx run api:test` passes; `nx run-many -t build --exclude=landing`
  compiles clean.
