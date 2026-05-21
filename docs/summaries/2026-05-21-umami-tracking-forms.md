# Umami tracking (forms) — Session Summary

**Date:** 2026-05-21
**Branch:** feat/umami-tracking-forms
**PR:** (to be opened against `dev`)

## What was built

`apps/forms` now emits curated Umami Cloud events covering the form-fill funnel: form open, per-step view, advance and back navigation, per-field client-side validation errors, submit lifecycle (attempt / success / server-error / network-error), and file selection. The Umami script is injected from `src/main.tsx` only when `VITE_UMAMI_WEBSITE_ID` is set; pageviews fire from a single TanStack Router `onResolved` subscriber rather than Umami's auto-tracker. A typed helper at `src/lib/analytics.ts` (`trackEvent`, `trackPageview`) no-ops when `window.umami` is absent, so call sites carry zero defensive checks. The env contract and event taxonomy are documented in a new `apps/forms/README.md`.

## Why it looks the way it does

**Started as a re-spec but pivoted on orientation.** The session opened as if Umami tracking for `apps/forms` was new work, with a spec patterned after the `apps/landing` setup (`VITE_UMAMI_WEBSITE_ID`, curated `data-umami-event` attributes, slug-derived event names). Orientation showed two things that changed the brief: (a) `apps/landing` already has the full Umami treatment merged on `dev`, (b) the user clarified the scope is the forms app, where the landing-style click-tag pattern is the *wrong* shape — forms care about step progression, field validation, and submission outcome, none of which are simple `<a>`-click events. The plan was rewritten around that shift.

**Worked off `apps/forms`, not `apps/web`.** The dev branch had a `refactor: rename apps/web to apps/forms` commit but the local working tree still had a stale `apps/web` directory with a single orphaned `submit-form.ts` file. Initial code reads landed in the stale directory before the rename was caught. The orphan is flagged in the plan; cleanup is left for a separate PR.

**Event names are a small fixed set; cardinality goes in data.** `apps/landing` uses per-item names like `service-renew-passport` because its directory is small and bounded. `apps/forms` is the opposite — form × step × field × reason would explode Umami's metric list every time a form is added or a step splits. Decision recorded in `docs/decisions/0004-analytics-events-use-fixed-names-and-structured-data.md` because the same question will come up for any future app adding analytics.

**Three deviations from the original spec, surfaced during code reading.**

1. **File-upload events collapsed to `form-file-select` only.** The existing `FileUpload` component stores `File` objects directly in form state — there is no per-file upload step; files travel with the submission. So `form-file-upload-success` / `form-file-upload-error` had no hook point. Upload success and failure are covered by `form-submit-success` / `form-submit-error` instead.
2. **`form-field-error` uses a single `reason: 'validation'`.** `form.validateField` returns formatted message strings, not structured reason codes. Pattern-matching message text to derive `required` / `format` / `min` / `max` would couple analytics to copy and break the first time validation messages are localised. `'server'` is reserved for post-submit field errors from the API; `form-submit-error` keeps its richer reason set (`server` / `network`). Granular client-side reasons can come later when `validation-methods.ts` returns structured results alongside messages.
3. **Field identifier is `field.fieldId`, not `field.id`.** `field.id` is the UI-instance identifier and is often step-namespaced via `getFullFieldId`/`stepFieldIdConcactenator`; `field.fieldId` is the stable code-defined name. Using `fieldId` keeps event payloads stable across step renames and repeatable-step instances and avoids leaking step structure into the data.

**Pageviews stay on real URLs; step changes live in events.** A `?step=` query-param change triggers `onResolved` and fires a pageview, but Umami groups by path so the form's URL shows one row with steps invisible. Considered overriding `umami.track`'s URL property to synthesise `/forms/<formId>/<stepId>` paths in the Pages report; rejected because it invents URLs that don't exist and the same data already lives in `form-step-view` events with full context.

**Form ID plumbed through props; step ID derived from the field.** First attempt at `form-file-select` used `useParams` / `useSearch` inside `FileUpload` to pull `form_id` and `step_id` from the route. Two test failures surfaced: `ts-jest`'s jsdom env lacked `TextEncoder`, and `useParams` requires a `RouterProvider` ancestor which the existing component spec doesn't provide. A `TextEncoder` polyfill would have unblocked the first but not the second, and either fix only made the component route-aware *just for analytics*. Instead, `formId` is now an optional prop on `FileUpload` (plumbed through `FieldRenderer` → `FormRenderer` from `formMeta.formId`), and `step_id` comes from `field.stepId` which is already on `ClientPrimitive`. The pure component stays pure.

**Repeatable-step transitions are silent.** When `handleContinue` takes the `repeatable add` or `repeatable remove` branch, no `form-step-advance` event fires — that path was explicitly out of v1 scope per the brief. The user is still on a step, so the next `form-step-view` event still fires when the new step resolves; only the advance signal is dropped. If repeatable analytics becomes desired later, the relevant hook points are already isolated in those two branches of `handleContinue`.

**`form-submit-error` was added on the failed/error branches that the existing code left as `//TODO`.** Those branches had no UI handling for a failed submission — the `submissionState` model doesn't model failure yet. This PR adds the analytics event but does not extend `SubmissionState` to render a failure screen; that's a separate concern. A network-level `try/catch` around `postFormSubmission` covers the throws-from-fetch case with `reason: 'network'`.

**Privacy bar.** This is a government forms app, so the floor is high: never capture field values, field labels, free-text input, or filenames. Field IDs (stable, code-defined), step/form IDs, MIME types, file sizes in KB, and reason categories are the only identifiers and metadata that leave the browser. Codified in the decision record alongside the naming convention.

## Decisions worth flagging

- **Analytics taxonomy and privacy** are now codified at `docs/decisions/0004-analytics-events-use-fixed-names-and-structured-data.md`. `apps/landing` is explicitly exempt (its directory surfaces are bounded); any *new* app adding analytics must follow the fixed-names + structured-data pattern unless that decision is re-opened.
- **Repeatable-step events are out of v1.** Reopening this is fine when the shape of repeatable analytics is clearer (likely after a real form ships with repeatable use); the wiring point is `handleContinue` in `form-renderer.tsx`.
- **Granular client-side validation reasons are deferred.** Will be re-opened when `validation-methods.ts` is restructured to return reason codes alongside formatted messages.

## Outstanding / out of scope

- **`pnpm --filter @govtech-bb/forms lint` is broken** — pre-existing, unrelated to this work. `eslint-plugin-react`'s `react/display-name` rule crashes on `apps/forms/src/coverage/*.css` (Jest coverage artifacts). Either the `coverage` dir needs to be ignored in the eslint config or the rule needs to be configured not to touch non-JS files. Worth a separate ticket.
- **End-to-end browser verification of the env-set path** — not performed in this session. The env-unset case is verified at build level (no `cloud.umami.is` URL in the produced bundle when `VITE_UMAMI_WEBSITE_ID` was empty at build time). The env-set case (real Umami website ID → events arrive in the realtime view) needs a manual run before merge; the plan's "Verify" section spells out the checklist.
- **Orphaned `apps/web/src/lib/form-builder/submit-form.ts`** — leftover from the `apps/web` → `apps/forms` rename. Out of scope here; flag for cleanup.

## Key files

| File | Change |
|---|---|
| `docs/plans/umami-tracking-forms.md` | New — plan with deviations recorded |
| `docs/decisions/0004-analytics-events-use-fixed-names-and-structured-data.md` | New — codifies naming + privacy conventions |
| `apps/forms/src/lib/analytics.ts` | New — typed `trackEvent`, `trackPageview`; no-ops without `window.umami` |
| `apps/forms/src/lib/analytics.spec.ts` | New — Jest tests, TDD'd before the helper |
| `apps/forms/src/main.tsx` | Env-gated script injection + `router.subscribe('onResolved', trackPageview)` |
| `apps/forms/src/routes/forms/$formId/index.tsx` | `form-open` on mount, submit-lifecycle events including the previously-untracked `failed` / `error` / network branches |
| `apps/forms/src/components/form-renderer.tsx` | `form-step-view`, `form-step-advance`, `form-step-back`, `form-field-error`, `form-submit` |
| `apps/forms/src/components/field-renderer.tsx` | Forwards `formId` prop to `FileUpload` |
| `apps/forms/src/components/file-upload.tsx` | `form-file-select` per picked file with `mime` + `size_kb`; no filenames |
| `apps/forms/src/types/props.type.ts` | Optional `formId` on `FileUploadProps` |
| `apps/forms/.env.example` | `VITE_UMAMI_WEBSITE_ID` + `VITE_UMAMI_SRC` documented |
| `apps/forms/README.md` | New — Analytics section with the event-taxonomy table and privacy rules |
