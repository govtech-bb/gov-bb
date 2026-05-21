# Umami tracking (forms)

## Goal

Measure how applicants progress through the government forms in `apps/forms`: which forms get opened, where users drop off between steps, which fields cause validation errors, how file uploads behave, and how submissions complete. Use Umami Cloud with curated events so the data answers "where is the funnel leaking?" without capturing any applicant PII.

> **Scope:** `apps/forms` only — the Vite + TanStack Router forms SPA. The landing app already has its own Umami setup (`docs/plans/umami-tracking.md`) and is untouched here.

## Approach

**Chosen.** Mirror the env-gating, script-injection, and `analytics.ts` helper shape from `apps/landing`, but diverge in the event model: forms use a **small fixed set of event names** with high-cardinality dimensions (`form_id`, `step_id`, `field_id`, `reason`) carried as event data. Pageviews fire from `router.subscribe('onResolved', trackPageview)` so route changes including the `?step=` search-param give one pageview per visible step automatically; per-step events still fire with full structured context.

**Considered and rejected.**

- **High-cardinality event names** (`form-renew-passport-step-personal-details-error` …) — landing's pattern. Doesn't scale for forms: every form × step × field × reason becomes its own dashboard metric. Switched to small-set-with-data.
- **Synthetic step URLs** (overriding `umami.track` with `url: '/forms/renew-passport/personal-details'`). Cleaner Pages report but invents URLs that don't exist; structured event data carries the same signal and is easier to query. Skipped.
- **Per-keystroke / on-blur validation events.** Volume too high, signal-to-noise too low. Validation events fire only on advance-attempt and submit.
- **Tracking field labels or values.** Labels can drift with copy and risk leaking intent ("national ID number"); values are PII. `field_id` only.
- **Tracking filenames or repeatable-step interactions.** Filenames can be PII (e.g. `john_smith_passport.pdf`); repeatable steps are out of v1 scope per user.

## Scope

### Script + bootstrapping

- Read `VITE_UMAMI_WEBSITE_ID` and optional `VITE_UMAMI_SRC` (default `https://cloud.umami.is/script.js`).
- If `VITE_UMAMI_WEBSITE_ID` is unset, no script is injected — no requests to `cloud.umami.is`, no events.
- Otherwise inject `<script defer src="…" data-website-id="…" data-auto-track="false">` from `apps/forms/src/main.tsx` (CSR — apps/forms is a Vite SPA, not SSR). `data-auto-track="false"` so pageviews are the single deterministic source from the router subscriber.

### SPA pageview tracking

- In `main.tsx` after `createRouter(...)`, call `router.subscribe('onResolved', trackPageview)`.
- This covers `/`, `/forms`, `/forms/$formId`, `/admin/*`, and step changes (the `?step=` search param triggers `onResolved`).
- Pageviews carry the URL as-is — the step is visible in events, not in the Pages report (intentional, see Approach).

### Helper (TDD-first)

`apps/forms/src/lib/analytics.ts` exposing:

- `trackEvent(name: string, data?: Record<string, unknown>): void` — no-op when `window.umami` is absent.
- `trackPageview(): void` — no-op when absent.

Tested via Jest (`apps/forms/src/lib/analytics.spec.ts`) covering: no-op when `window.umami` is undefined, forwards name-only, forwards name + data. No `deriveStartEventName` needed here — that helper is landing-specific (slug-prefixed start CTAs in markdown content).

### Event taxonomy

A small fixed name set. All events carry `form_id` so dashboards can filter by form.

| Event name | Fires when | Data |
|---|---|---|
| `form-open` | `/forms/$formId` first resolves for a session | `form_id` |
| `form-step-view` | A step becomes visible (router resolution after step guard) | `form_id`, `step_id`, `step_index`, `step_count` |
| `form-step-advance` | User clicks "Continue" and the step guard advances | `form_id`, `from_step`, `to_step` |
| `form-step-back` | User clicks "Back" / browser back resolves to a prior step | `form_id`, `from_step`, `to_step` |
| `form-field-error` | A field fails validation on advance-attempt or submit (one event per failing field) | `form_id`, `step_id`, `field_id`, `reason` (`required` \| `format` \| `min` \| `max` \| `server`) |
| `form-submit` | User clicks the final submit button | `form_id` |
| `form-submit-success` | Submission succeeds | `form_id`, `step_count` |
| `form-submit-error` | Submission fails | `form_id`, `reason` (`validation` \| `server` \| `network`), `status` (optional, when `reason='server'`) |
| `form-file-select` | User picks a file in a file-upload field | `form_id`, `step_id`, `field_id`, `mime`, `size_kb` |

**Naming rules.** Event names use a fixed `form-<action>` shape; never embed `form_id`, `step_id`, or `field_id` into the name. Data property names are `snake_case` to keep them consistent in Umami's UI.

### Deviations from the original spec (confirmed during implementation orientation)

1. **File-upload events collapsed to `form-file-select` only.** The current `FileUpload` component stores `File` objects directly in form state — there is no separate per-file upload step. Files travel with the submission via `postFormSubmission`. Upload success/failure are therefore already covered by `form-submit-success` / `form-submit-error`. The previously listed `form-file-upload-success` and `form-file-upload-error` events have no hook point and are removed.
2. **`form-field-error` uses a single `reason: 'validation'` for client-side errors.** `form.validateField` returns formatted error message strings, not structured reasons. Deriving `required` / `format` / `min` / `max` from message text is fragile and tightly couples analytics to copy. For v1, client-side field failures fire with `reason: 'validation'`; `'server'` is reserved for post-submit field errors surfaced from the API. `form-submit-error` keeps its richer reason set (`validation` / `server` / `network`). Granular client-side reasons can be added later once `validation-methods.ts` returns reason codes alongside messages.
3. **Field identifier is `field.fieldId`, not `field.id`.** `field.id` is the UI-instance identifier and is sometimes step-namespaced via `getFullFieldId`/`stepFieldIdConcactenator`; `field.fieldId` is the stable code-defined name. Analytics uses `fieldId` because it is stable across renames and repeatable-step instances, and does not leak step structure into the event payload.

### Privacy bar

- Never capture: field values, field labels, free-text field input (incl. feedback/comments), filenames.
- Always OK: field IDs (stable, code-defined), step IDs, form IDs, MIME types, file sizes in KB, validation reason categories, HTTP status codes.
- If a future form ever uses a `field_id` that contains user-supplied content (e.g. dynamically generated repeatable IDs), revisit before adding it to events. v1 does not track repeatable steps so this isn't a v1 concern.

### Wiring points

- `main.tsx` — env-gated script tag injection + `router.subscribe('onResolved', trackPageview)`.
- `src/routes/forms/$formId/…` (the active form route) — fire `form-open` on first resolve; fire `form-step-view` when step resolution completes (likely in `use-step-guard` or the step-rendering component).
- `src/components/form-renderer.tsx` — fire `form-step-advance` / `form-step-back` on navigation, `form-submit` / `form-submit-success` / `form-submit-error` on the submit lifecycle, `form-field-error` per failed field on advance-attempt or final submit.
- `src/components/file-upload.tsx` — fire `form-file-select` / `form-file-upload-success` / `form-file-upload-error`.
- `src/components/error-summary.tsx` — optionally fire `form-field-error` events here if it owns the validation result (decide during impl; only one source per error to avoid double-counting).

### Documentation

- `apps/forms/.env.example` — add `VITE_UMAMI_WEBSITE_ID` (empty by default) and commented `VITE_UMAMI_SRC` override, matching the landing contract.
- `apps/forms/README.md` (create if missing) — short "Analytics" section: env gate, manual pageview firing, the event-name table above, the privacy rules.

## Files

**Add:**

- `apps/forms/src/lib/analytics.ts`
- `apps/forms/src/lib/analytics.spec.ts`

**Modify:**

- `apps/forms/src/main.tsx` — script injection + pageview subscriber.
- `apps/forms/src/routes/__root.tsx` — if needed for the script tag head element (depends on whether SPA shell or `main.tsx` is the right injection point; resolve during impl).
- `apps/forms/src/components/form-renderer.tsx` — step nav + submit lifecycle events.
- `apps/forms/src/components/file-upload.tsx` — file lifecycle events.
- `apps/forms/src/components/error-summary.tsx` — field-error events (single source of truth for validation failures).
- `apps/forms/src/hooks/use-step-guard.tsx` — fire `form-step-view` when a step becomes the resolved step.
- `apps/forms/.env.example` — env var contract.
- `apps/forms/README.md` — Analytics section.

**Not in scope:**

- `apps/landing/*` — existing Umami setup is untouched.
- `apps/web/src/lib/form-builder/submit-form.ts` — orphaned leftover from the apps/web → apps/forms rename. Clean up in a separate PR.
- `apps/api`, `apps/chat`, `apps/form_builder` — out of scope.

## Verify

- `nx test forms` — analytics helper unit tests pass (Jest).
- `nx lint forms` and `nx typecheck forms` (or equivalent project script) clean.
- `nx build forms` clean.
- **Env var unset** (default dev): built `index.html` and rendered DOM contain no `cloud.umami.is` script tag; network panel shows zero requests to `umami.is`; `window.umami` is undefined; `trackEvent` / `trackPageview` calls are silent.
- **Env var set** (staging-style local): script appears in `<head>` with `data-website-id` and `data-auto-track="false"`; opening the app fires one pageview in Umami's realtime view; navigating between routes fires pageviews; advancing a form step fires `form-step-view` + `form-step-advance`; triggering a validation error fires `form-field-error` with `field_id` and `reason`; selecting and uploading a file fires the three file events; submitting fires `form-submit` + `form-submit-success` (or `-error` on failure).
- Manual privacy audit: capture a session in Umami's events view and confirm zero events contain field values, labels, filenames, or user text.

## Open questions

- **Where exactly to fire `form-step-view`?** Two candidates: `use-step-guard` (knows when the resolved step becomes accessible) and the step-rendering component (knows when it actually mounts with content). Pick during implementation after reading both; pick the spot that fires exactly once per visible step.
- **`form-open` deduping.** Should `form-open` fire on every visit to `/forms/$formId`, or only the first visit per session? Default to "every visit" — simpler, and Umami's sessions view already groups them. Revisit if the data is noisy.
- **Admin routes.** `src/routes/admin/` will get pageviews automatically. Anything inside admin that needs curated event tagging is out of v1 — flag during impl if a high-value admin interaction surfaces.
