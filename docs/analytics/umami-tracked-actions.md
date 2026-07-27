# Umami analytics — tracked user actions

_A reference of every user action captured via Umami across the GovTech BB
platform. Generated from the codebase on `sandbox`._

## How tracking works

- **Two packages, distinct roles:**
  - `packages/analytics` — the **instrumentation** apps call to fire events
    (`trackEvent`, `trackPageview`, and the typed `TrackingData` event catalogue).
  - `packages/umami-analytics` — the **reporting client** that reads the Umami
    Cloud API to build reports (not user-facing tracking).
- **Manual, not autotrack.** The Umami script is injected with
  `data-auto-track="false"` in both `forms` and `landing`, so Umami does **not**
  auto-capture pageviews or clicks. Every event below is fired by an explicit
  code call (or a declarative `data-umami-event` attribute — see the last
  section).
- **Form events are namespaced.** For form events carrying a `form` property, the
  event is sent to Umami as `<formId>:<event>` (e.g.
  `apply-for-national-summer-camp-2026:form-submit`), so metrics can be sliced
  per form.
- **Enablement.** Controlled by `VITE_UMAMI_WEBSITE_ID` (per app). Unset locally
  by default, so dev traffic is excluded. Script source overridable via
  `VITE_UMAMI_SRC` (defaults to Umami Cloud).
- **Privacy note.** Tracked payloads deliberately avoid personal data: the chat
  box does not send the typed query on submit, feedback sends no free-text, and
  search records only the query string + result count. File-select records
  mime/size, not filename or contents.

---

## Forms app — form journey (`packages/analytics` `TrackingData`)

These are the typed events; each is sent namespaced as `<formId>:<event>`.

| Event | Fires when | Payload |
|---|---|---|
| `form-start` | The form page mounts (once per form) | `form`, `category` |
| `form-step-view` | A step is rendered | `form`, `category`, `step` |
| `form-step-back` | "Previous" is clicked | `form`, `category`, `step` |
| `form-step-<word>` | "Continue" clicked & step validates (e.g. `form-step-one`, step index as a word) | `form`, `category`, `step` |
| `form-step-edit` | "Change" clicked on the review page | `form`, `category`, `step` |
| `form-file-select` | A file is chosen on an upload field (per file) | `form`, `category`, `step`, `field`, `mime`, `size_kb` |
| `form-validation-error` | "Continue" clicked but the step fails validation | `form`, `category`, `step`, `errorCount`, `fields`, `errorTypes` |
| `form-review` | User leaves the "check your answers" step (dwell time) | `form`, `category`, `duration_seconds` |
| `form-submit` | Submission succeeds server-side | `form`, `category`, `duration_seconds` (since `form-start`) |
| `form-submit-error` | Submission fails (network / payment-init / server error) | `form`, `category`, `errors` |
| **pageview** | Every route resolves (`router.onResolved`) | — (untagged pageview) |

## Landing app — service discovery pages

| Event | Fires when | Payload |
|---|---|---|
| `page-service-view` | A content/service page with a `form_id` loads | `form`, `category` |
| `page-start-view` | A `/start` sub-page loads | `form`, `category` |
| `search` | The search-results page renders with a query | `query`, `results` |
| `search-submit` | The search box is submitted | `query`, `source` (`home` / `services` / `results`) |
| **pageview** | Every route navigation | — (untagged pageview) |

## Landing app — chat assistant

| Event | Fires when | Payload |
|---|---|---|
| `chat-submit` | User submits a query in the chat box (query text **not** sent) | `source` |
| `chat-suggestion` | User clicks a suggested question | `question`, `source` |

## Landing app — feedback ("was this helpful")

| Event | Fires when | Payload |
|---|---|---|
| `feedback-submit` | Feedback form submitted | — |
| `feedback-success` | Feedback saved successfully | — |
| `feedback-error` | Feedback validation or server failure | `reason` (`validation` / `server`) |

## Landing app — footer links

| Event | Fires when | Payload |
|---|---|---|
| `footer-home` | Footer "Home" clicked | — |
| `footer-terms` | Footer "Terms & Conditions" clicked | — |
| `footer-careers` | Footer "Careers" clicked | — |

---

## Declarative click attributes (`data-umami-event`)

These elements are tagged for click tracking. **They only fire if Umami
autotracking is enabled** — today `data-auto-track="false"`, so they are marked
for future enablement rather than currently active.

| Event | Element / trigger | Extra data |
|---|---|---|
| `breadcrumb` | Breadcrumb links | `to`, `depth` |
| `helpful-feedback` | "Help us improve" link | `path` |
| `bank-holiday-year-prev` / `bank-holiday-year-next` | Bank-holiday calendar year nav | `year` |
| `service-<slug>` | Service link on the services listing (per service) | `title` |
| `<formId>-start` | "Start now" button in markdown content (per form) | `from` (source path) |

---

## Coverage summary

- **Form funnel:** start → per-step views/back/edit → file selects → validation
  errors → review dwell → submit / submit-error. Enough to build a per-form
  completion funnel and drop-off analysis.
- **Discovery:** service/start page views, search (query + results), chat
  engagement, feedback outcomes, footer navigation.
- **Not tracked / by design:** no personal data, no free-text content (search
  query is the one exception), no automatic pageview/click capture — everything
  is explicit.

_To regenerate: review `packages/analytics/src/index.ts` (`TrackingData`) for the
typed catalogue, then grep the apps for `trackEvent(`, `trackPageview(`, and
`data-umami-event` for call sites._
