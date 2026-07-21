# Web Analytics & User-Journey Tracking Audit

**Date:** 2026-07-20 · **Scope:** Umami web analytics across `apps/landing` and
`apps/forms` (all other apps carry no analytics) · **Epic:**
[#1751](https://github.com/govtech-bb/gov-bb/issues/1751) — Observability ·
**Phase:** 1c — Understand · **Tracking issue:**
[#1765](https://github.com/govtech-bb/gov-bb/issues/1765)

> This is the committed record for Phase 1c: a full inventory of the
> citizen-behaviour tracking that exists **today** and where the gaps are, so
> the Phase 2 tooling evaluation ([#1754](https://github.com/govtech-bb/gov-bb/issues/1754))
> and Phase 3d implementation ([#1758](https://github.com/govtech-bb/gov-bb/issues/1758))
> start from ground truth.
>
> It supersedes the implementation-summary comment on #1765 (originally from
> [#1661](https://github.com/govtech-bb/gov-bb/issues/1661)), which was the
> starting point for this audit. That comment predated the analytics-package
> refactors and its event inventory had drifted from the code — the
> **Reconciliation** section at the end records exactly what changed and why the
> tables here are authoritative.

## Executive summary

Web analytics is **Umami** (Umami Cloud by default), wired into the two
public-facing apps — `apps/landing` and `apps/forms` — through one shared,
SSR-safe wrapper package (`@govtech-bb/analytics`). No other app (`api`, `chat`,
`web`, `cms`, `form_builder`, `form_builder_api`) sends analytics. Tracking is
opt-in per deployment via a single env var; with it unset no script loads and no
requests are made. Pageviews are driven manually from the TanStack Router
(auto-track is off) so they stay deterministic. Forms emits a full
form-funnel telemetry set (start → step → review → submit / error, plus
file-select and validation errors); landing emits navigation, search, chat,
feedback, and service/page-view events. Data is read back through an internal,
server-side dashboard app (`apps/analytics`) that queries the Umami API live —
no snapshot, no database.

The **biggest gaps** are: no analytics on authenticated/admin surfaces
(`form_builder`, `cms`) or on `chat`/`web`; no cross-app session stitching
(landing → forms are separate Umami websites); and dashboard/Umami-Cloud access
is not yet formally provisioned or documented per person (see
[Access & usage](#access--usage)).

## Current tooling

### Tool

**Umami** — a privacy-first, cookieless web-analytics product. The default
backend is **Umami Cloud** (`https://cloud.umami.is/script.js`); the script URL
is overridable per app for self-hosting or a different region.

### Packages

| Package | Role |
|---|---|
| `@govtech-bb/analytics` (`packages/analytics/src/index.ts`) | Centralized, SSR-safe tracking wrapper. **All** client tracking goes through it — `trackEvent`, `trackPageview`, plus the typed `TrackingData` event contract and name-derivation helpers (`deriveStartEventName`, `stepNumberToWord`). |
| `@govtech-bb/umami-analytics` (`packages/umami-analytics`) | Thin Umami REST client + funnel/journey shaping, used **server-side** by the dashboard app. |
| `apps/analytics` (`@govtech-bb/analytics-app`) | Internal read-only dashboard (TanStack Start SSR on Amplify compute) that queries Umami live. |

Each client app re-exports the wrapper through a local shim
(`apps/landing/src/lib/analytics.ts`, `apps/forms/src/lib/analytics.ts`).

### The wrapper contract (`@govtech-bb/analytics`)

```ts
// SSR no-op; no-op until the Umami script has loaded.
export function trackEvent(name: string, data?: Record<string, unknown>): void;
export function trackPageview(): void;          // pageview = umami.track() with no args
export function deriveStartEventName(href): string;  // path → "<slug>-start"
export function stepNumberToWord(n): string;    // 1..10 → "one".."ten"
```

`trackEvent` is overloaded with a typed `TrackingData` map for the known forms
events, and applies one important rule: **if the payload has a `form` field and
the event name has no `:` prefix, the event is re-emitted namespaced as
`` `${data.form}:${event}` ``** (e.g. `renew-passport:form-start`). Names that
already contain `:` (the per-step completion events) are forwarded as-is. This
per-form namespacing is what the dashboard's funnel/journey reports key on.

### Which apps send data

| App | Analytics? | Notes |
|---|---|---|
| `apps/landing` | ✅ | Navigation, search, chat, feedback, service/page views |
| `apps/forms` | ✅ | Full form-funnel telemetry |
| `apps/api`, `apps/chat`, `apps/web`, `apps/cms`, `apps/form_builder`, `apps/form_builder_api` | ❌ | No Umami integration |

## Script injection & configuration

Both apps gate the script on `VITE_UMAMI_WEBSITE_ID` and set
`data-auto-track="false"`, then fire pageviews manually from the router
`onResolved` subscriber — one deterministic pageview source.

|  | Landing | Forms |
|---|---|---|
| **Where injected** | SSR `head()` config — `apps/landing/src/routes/__root.tsx` | Client DOM (`document.head.appendChild`) — `apps/forms/src/main.tsx` |
| **Pageviews** | `router.subscribe('onResolved', trackPageview)` — `apps/landing/src/router.tsx` | `router.subscribe('onResolved', trackPageview)` — `apps/forms/src/main.tsx` |
| **Auto-track** | `data-auto-track="false"` | `data-auto-track="false"` |
| **Gate** | `VITE_UMAMI_WEBSITE_ID` (unset ⇒ no script, no requests) | same |
| **Script URL** | `VITE_UMAMI_SRC` (default `https://cloud.umami.is/script.js`) | same |

**Env vars** (see each app's `.env.example`):

- `VITE_UMAMI_WEBSITE_ID` — public website ID; **unset disables tracking
  entirely**. Landing and forms use **separate** Umami website IDs.
- `VITE_UMAMI_SRC` — optional script-URL override (self-host / region).

## Events currently tracked

### Landing (`apps/landing`)

A mix of imperative `trackEvent(...)` calls and declarative
`data-umami-event="…"` attributes (which Umami reads on click).

| Event | Where | Data |
|---|---|---|
| `footer-home` / `footer-terms` / `footer-careers` | `routes/__root.tsx` | — |
| `header-*` | `components/Header.tsx` | *(none — Header no longer tracks; see Reconciliation)* |
| `search-submit` | `routes/index.tsx`, `services.tsx`, `search-results.tsx` | `{ query, source: home \| services \| results }` |
| `search` | `routes/search-results.tsx` | `{ query, results }` (result-count on a resolved search) |
| `chat-submit` / `chat-suggestion` | `components/ChatAssistant.tsx` | `{ source }` / `{ question, source }` |
| `feedback-submit` / `feedback-success` / `feedback-error` | `components/FeedbackForm.tsx` | error: `{ reason: validation \| server }` |
| `helpful-feedback` | `components/HelpfulBox.tsx` | `-path` attr |
| `<formId>-start` | `components/markdown/StartLink.tsx` | `-from` (pathname) attr |
| `service-<slug>` | `routes/services.tsx` | `-title` attr |
| `breadcrumb` | `components/Breadcrumbs.tsx` | `-to`, `-depth` attrs |
| `bank-holiday-year-prev` / `-next` | `routes/bank-holiday-calendar/index.tsx` | `-year` attr |
| `page-service-view` / `page-start-view` | `routes/$.tsx` via `routes/-page-view-event.ts` | `{ form, category }` — fired on content-page mount when the page has a `form_id` (`/start` slug ⇒ `page-start-view`, else `page-service-view`) |

### Forms (`apps/forms`)

Form-funnel telemetry, all via `trackEvent(...)`. Every event carries `form` and
`category`, and is re-emitted namespaced as `<form>:<event>` by the wrapper.
`category` comes from `categoryForForm()` in `@govtech-bb/content`; durations are
seconds.

| Event | Where | Data |
|---|---|---|
| `form-start` | `routes/forms/$formId/index.tsx` | `{ form, category }` — also stamps the start time |
| `form-step-view` | `components/form-renderer.tsx` | `{ form, category, step }` |
| `<form>:form-step-<word>` | `components/form-renderer.tsx` → `step-events.ts` | `{ form, category, step }` — per-step **completion**, name is pre-qualified (`stepCompleteEventName`, 1-based word) |
| `form-step-back` | `components/form-renderer.tsx` | `{ form, category, step }` |
| `form-step-edit` | `components/review.tsx` | `{ form, category, step }` — "Change" link on check-your-answers |
| `form-review` | `components/form-renderer.tsx` | `{ form, category, duration_seconds }` — fired on **leaving** the review step |
| `form-validation-error` | `components/form-renderer.tsx` → `validation-error-event.ts` | `{ form, category, step, errorCount, fields, errorTypes }` (comma-joined field ids / error types) |
| `form-file-select` | `components/file-upload.tsx` | `{ form, category, step, field, mime, size_kb }` |
| `form-submit` | `routes/forms/$formId/index.tsx` | `{ form, category, duration_seconds }` — only on a saved (`form-submit-success`) outcome |
| `form-submit-error` | `routes/forms/$formId/index.tsx` | `{ form, category, errors }` — `errors` is `"network"` or the failure reason/name |

### Pageviews

Manual on both apps: `data-auto-track="false"` on the script, and a single
`router.subscribe('onResolved', trackPageview)` per app fires one pageview per
resolved navigation.

## Access & usage

- **Raw Umami dashboard** — the Umami Cloud account behind the two website IDs.
  The read API key lives **server-side only** (in the dashboard app's Nitro
  runtime config); the browser never talks to Umami directly.
- **Internal dashboard app** — `apps/analytics` (`@govtech-bb/analytics-app`), a
  TanStack Start SSR app on Amplify compute. It reads Umami **live, server-side,
  per request** (no snapshot, no DB; ~60s in-memory TTL) and renders a site
  overview + per-form funnel / journeys / submit-error views. It is `noindex`,
  has no public navigation, and is a standalone internal view. Methodology is
  documented in [`docs/analytics/umami-dashboard-methodology.md`](../analytics/umami-dashboard-methodology.md).

> **⚠ Needs the team to verify before Phase 2 sign-off (AC of #1765):** exactly
> *who* holds Umami Cloud credentials, the internal dashboard's deployed URL and
> access gating, and whether the data is being actively used to inform
> decisions. The code confirms *how* the data is read; the *who/how-to-get-it*
> is an operational fact to be captured with the team, not derivable from the
> repo.

## Gaps & coverage

**Untracked apps / surfaces**
- `apps/chat` and `apps/web` send no analytics — chat interactions are only
  visible via landing's `chat-submit` / `chat-suggestion` proxy events, not
  within chat itself.
- Authenticated/admin surfaces (`apps/form_builder`, `apps/form_builder_api`,
  `apps/cms`, `apps/api`) have no usage analytics.

**Cross-journey blind spots**
- Landing and forms are **separate Umami websites**, so a citizen crossing from
  a landing service page into the form is not stitched into one session; the
  hand-off is inferred from the `<formId>-start` / `page-start-view` events on
  landing and `form-start` on forms, not tracked end-to-end.
- No post-submission / payment-outcome journey tracking beyond `form-submit` /
  `form-submit-error` (payment success/return is not a distinct analytics event).

**Known limitations**
- Tracking is entirely client-side and dependent on the Umami script loading;
  `trackEvent` silently no-ops if the script is blocked or hasn't loaded yet.
- No alerting, SLOs, or error tracking here — this is product analytics only;
  those remain Phase 3 deliverables under the selected tooling.
- `header-*` events referenced in older docs no longer exist (removed from
  `Header.tsx`); any historical dashboard relying on them is stale.

## Privacy notes

- **No PII.** Forms never sends field values, labels, or filenames — only ids,
  counts, MIME type, and size. Landing search sends the query string, but only
  as event data.
- **Cookieless / opt-in by deployment.** With `VITE_UMAMI_WEBSITE_ID` unset, no
  script loads and no requests are made.
- **Server-side read.** The Umami API key never reaches the browser; the
  dashboard app is the only reader and returns aggregate-only data.

## Reconciliation with the #1765 starting-point comment

The implementation-summary comment (from #1661) predated the analytics-package
refactors. Corrections captured here:

**Forms — event scheme fully renamed** (the comment's names now survive only in
stale coverage HTML, not in source):

| Comment (stale) | Current (source of truth) |
|---|---|
| `form-open`, flat `{ form_id }` | `form-start`, `{ form, category }` |
| `form-step-advance` | per-step `<form>:form-step-<word>` completion events |
| `form-submit-success` | *(internal outcome name)* — telemetry event is `form-submit` with `duration_seconds` |
| `form-field-error` | `form-validation-error` with `{ errorCount, fields, errorTypes }` |
| payloads keyed `form_id`, `step_id`, `step_index` | keyed `form`, `category`, `step`; `<form>:<event>` namespacing added |
| *(absent)* | `form-step-edit`, `form-review` added |

**Landing — drift:**
- `header-home` / `header-services` / `header-mobile-services` — **removed**;
  `Header.tsx` no longer tracks.
- `search` (`{ query, results }`) and `page-service-view` / `page-start-view`
  (`{ form, category }`) — **added** since the comment.

Everything else in the comment (script gating, manual pageviews, env vars,
privacy posture, the landing footer/search-submit/chat/feedback/breadcrumb/
service/bank-holiday events) still holds and is reflected above.
