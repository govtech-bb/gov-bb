# Route a per-submission email to the selected school (textbook grant)

Issue: [#1213](https://github.com/govtech-bb/gov-bb/issues/1213)

## Context

On each submission of "Get a Primary School Textbook Grant"
(`get-a-primary-school-textbook-grant`), the child's school should receive a
notification email, alongside the existing applicant confirmation — routed to an
address chosen by the school the applicant selects.

The platform already supports this in principle: a processor's `recipientField`
is `dynamic()` and resolved by JSONLogic per-submission. What was missing was the
school→email mapping, an op to turn the selected key into an address, and the
processor wiring.

## What we did

- **`packages/registry`** — added `primary-school-emails.ts`: the 70-entry
  `SCHOOL_EMAILS` map (copied verbatim from the legacy `form-processor-api`
  sender, incl. the deliberate `elliot-belgrave → BoscobelPrimary@mes.gov.bb`
  rename) plus `SCHOOL_EMAIL_FALLBACK = "testing@govtech.bb"`. A guard spec keeps
  the map 1:1 with `PrimarySchool.options` (no missing/orphan keys). Exported from
  both `components/index.ts` and the package `src/index.ts`.
- **`packages/expressions`** — added the `schoolEmail` op
  (`SCHOOL_EMAILS[String(key)] ?? SCHOOL_EMAIL_FALLBACK`), registered it, and
  added the `@govtech-bb/registry` dependency + tsconfig project reference (the
  monorepo `tsc` build gotcha). Also fixed a latent bug in this package's jest
  `moduleNameMapper` (a redundant `packages/` segment that resolved to
  `packages/packages/X`) — never exercised until this first cross-package import.
- **`apps/api`** — new recipe `1.7.0.json` adding the school email processor
  (`recipientField: { "schoolEmail": { "var": "values.child-details.0.child-school" } }`),
  and batch-resolution tests in `expressions.service.spec.ts`.
- Decision record `0050` captures the batch-atomicity constraint that shaped the
  fallback.

## Why we did it that way

- **Mapping lives in registry code, not the recipe or a DB.** Form-builder
  republishes regenerate recipes from builder state and silently drop hand-edited
  recipe JSON, so an inline 70-entry switch wouldn't survive. A DB table was
  overkill once privacy was off the table. Code colocated with the school list is
  the durable, reviewable home.
- **The op always returns a non-empty address.** `resolveProcessors` validates the
  whole processor batch atomically — an empty `recipientField` fails the resolved
  schema and drops *every* email on the submission, including the applicant
  confirmation. The fallback makes that impossible; the guard spec makes a real
  miss impossible for valid input. (See decision `0050`.)
- **The var path reads index 0 of the `child-details` array.** The school is a
  `sharedFields` entry, and shared values are spread into every repeatable
  instance at submission (`apps/forms/src/lib/api/forms.ts:318`,
  `{ ...instance, ...sharedData }`), so index 0 always carries it.

## The version-drift correction (why this is 1.7.0, not 1.3.0)

The plan was written against `1.2.0` as the latest recipe and assumed the school
field still needed to be added as a `primary-school` select and made shared. By
the time work started, form-builder had already published `1.3.0`–`1.6.0` to
sandbox: **1.5.0** swapped the school field to the `primary-school` select (while
keeping the original `fieldId: "child-school"` override) and **1.6.0** made it a
shared field. So two of the plan's three recipe tasks were already done upstream,
and the field id is `child-school`, not `primary-school` as the plan's var path
assumed.

This drift also caused a scare: `cp 1.2.0.json 1.3.0.json` clobbered the
published `1.3.0` (cp overwrites). It was restored byte-identical from
`origin/sandbox`. Net recipe change shrank to a single new file (`1.7.0`) adding
only the processor. Lesson recorded for next time: list the worktree recipe dir
and diff latest-vs-assumed-base *before* copying.

## Open questions

None blocking.

- The `SCHOOL_EMAILS` map now lives in two repos (here + legacy
  `form-processor-api`) with no automated cross-repo drift guard — but the legacy
  sender is decommissioned, and the in-repo guard spec ties this copy to
  `PrimarySchool.options`, which is what matters going forward.
- Processors have carried forward across all four republishes so far (the
  applicant email persisted 1.2.0→1.6.0), so the school processor will likely
  survive future republishes — but it's a code-side recipe entry, so re-apply it
  if a republish ever drops it.
