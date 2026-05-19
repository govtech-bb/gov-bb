# Form Tracking — Plan

Track how citizens move through multi-step forms so product/policy can answer "where do users drop off?" and engineers can debug stuck users.

## Goal

Capture structural events for every form session in the web app — step transitions, validation errors, back navigation, submissions, and timing — into PostHog, where non-technical stakeholders can build funnels and drop-off dashboards. The existing OTel pipeline stays as-is for engineering observability and is not changed by this work.

## Approach

**Tool:** PostHog (SaaS, free tier to start). Chosen over Mixpanel/Amplitude because it covers both audiences (funnels + replay) under one vendor, and over extending OTel because Grafana/Tempo are not usable by non-technical staff. Replay is **off** for v1 — revisit later if engineers need it.

**Identity:** Anonymous `distinct_id` (PostHog default per-browser ID). Forms have no logged-in user. No PII is sent.

**Data boundary:** Structural only. We send field IDs (e.g. `applicant-first-name`), error types (`required`, `pattern`), step IDs, and timestamps. We **never** send what the user typed. The PostHog client is configured with `mask_all_text: true` and `disable_session_recording: true` as defence-in-depth, even though we are not capturing inputs.

**Abandonment:** Derived in PostHog by funnel — any session that recorded `form_started` but not `form_submitted` is abandoned. No explicit `form_abandoned` event in v1; we can add a heartbeat-on-unload later if the funnel proves insufficient.

**Implementation shape:** A small `tracking` module wraps `posthog-js` and exposes typed event functions. A top-level `PostHogProvider` initialises the client. Events are fired from three places: the `$formId` route (form start, submit), `use-step-guard` (step views, completion, back), and the field validation path (validation errors).

### Alternatives considered

- **Extend OTel to a product-friendly backend (e.g. add Honeycomb or Grafana Cloud).** Rejected — even with a nicer UI, no OTel-native backend is built for non-technical funnel analysis. Would mean engineers maintaining queries on behalf of policy.
- **Self-hosted PostHog now.** Rejected for v1 — adds infra ownership before we know whether the tool sticks. SaaS lets us validate the choice in a week; we can lift-and-shift to self-host later (same SDK, same data).
- **Mixpanel/Amplitude.** Rejected — pure analytics, no replay, more expensive at scale, and we lose the engineer-debugging path entirely.

## Scope

- Add `posthog-js` dependency to `apps/web`.
- New `tracking` lib module exposing typed event functions:
  - `trackFormStarted(formId, formVersion)`
  - `trackStepViewed(formId, stepId, stepIndex)`
  - `trackStepCompleted(formId, stepId, stepIndex, durationMs)`
  - `trackStepBack(formId, fromStepId, toStepId)`
  - `trackFieldValidationError(formId, stepId, fieldId, errorType)`
  - `trackFormSubmitted(formId, totalDurationMs)`
- A `PostHogProvider` mounted at the root, initialised with project key + host from Vite env (`VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`). No-op when keys are unset (local dev).
- Wire events into:
  - `routes/forms/$formId/index.tsx` — fire `form_started` on first mount; fire `form_submitted` on successful submission.
  - `hooks/use-step-guard.tsx` — fire `step_viewed` when a step becomes current; fire `step_completed` on successful continue; fire `step_back` on back navigation.
  - `components/form-renderer.tsx` (or the validation call site at line ~188) — fire `field_validation_error` for each field that fails validation, with the error type from Zod.
- Timing:
  - `step_started_at` held in a ref per current step; on `step_completed`, compute `durationMs` and reset.
  - `form_started_at` held in a ref at the route level; on `form_submitted`, compute total `durationMs`.
- Document env vars in `apps/web/.env.example` and the root `README.md` env table.

### Explicitly out of scope (for v1)

- Session replay (off, masking left on as defence-in-depth).
- Explicit `form_abandoned` event — derived from funnels instead.
- Server-side tracking from the NestJS API — the existing OTel metrics already cover what engineers need on the backend side.
- Cross-device or cross-session stitching — anonymous IDs only.
- Dashboard creation in PostHog — that's a follow-up for product/policy once events are flowing.

## Files

**New**
- `apps/web/src/lib/tracking/posthog-client.ts` — initialisation + provider.
- `apps/web/src/lib/tracking/events.ts` — typed event functions.
- `apps/web/src/lib/tracking/index.ts` — barrel.

**Modified**
- `apps/web/package.json` — add `posthog-js`.
- `apps/web/src/main.tsx` (or wherever the root provider tree lives) — mount `PostHogProvider`.
- `apps/web/src/routes/forms/$formId/index.tsx` — fire form_started / form_submitted, hold `formStartedAt` ref.
- `apps/web/src/hooks/use-step-guard.tsx` — fire step_viewed / step_completed / step_back, hold `stepStartedAt` ref.
- `apps/web/src/components/form-renderer.tsx` — fire field_validation_error after the `validateField` calls.
- `apps/web/.env.example` — add `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`.
- `README.md` — extend the env vars table.

## Verify

- With PostHog keys unset, the app boots and forms work; no network calls to PostHog.
- With keys set against a test PostHog project:
  - Loading a form fires one `form_started` event with the correct `form_id` and `form_version`.
  - Each step transition fires exactly one `step_viewed` and one `step_completed` with a sane `duration_ms` (> 0).
  - Back navigation fires `step_back` with correct `from`/`to` IDs.
  - Submitting an invalid field fires `field_validation_error` with the field ID and a non-empty `error_type`.
  - A completed submission fires `form_submitted` with a total `duration_ms` close to (sum of step durations + small overhead).
  - No event payload contains a value the user typed. Confirmed by inspecting events in the PostHog Live view while filling a form with obvious test strings.
- A funnel built in PostHog (form_started → step_viewed[step-1] → … → form_submitted) shows the expected drop-off shape on a test session.

## Open questions

- **Form version on `form_started`.** The contract already carries a `version` — confirm we want it on every event (recommended: yes, so funnels can be sliced by contract version).
- **Validation error firing cadence.** TanStack Form runs validation on `change`/`blur` and again on continue. Do we fire one event per failed field per submit attempt (recommended — noise control), or every keystroke that flips a field from valid → invalid (noisier, more accurate)?
- **PostHog project structure.** One project for all environments with an `env` super-property, or separate projects for dev/staging/prod? Doesn't block implementation, but should be decided before keys are issued.

---

Implementation is a separate session — run `/bb:dev-start` against this file when ready.
