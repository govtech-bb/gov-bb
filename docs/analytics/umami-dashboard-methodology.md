# Analytics dashboard — funnel & metric methodology

How `apps/analytics` computes what it shows, so the definitions can't silently
drift again (addresses the "documented methodology" acceptance criteria of
#1914 and #1915). All data is read **live, server-side** from the Umami Cloud
API on each request — there is no snapshot and no database.

## Data freshness (#1917)

Every page states a **"Live · <window> · queried <timestamp>"** banner. The
window is **last 30 days**. Data is fetched per request and deduped by a ~60s
in-memory TTL, so `queried` is when the underlying data was actually pulled (at
most ~60s before the page render).

## Form detail — headline stats (distinct visitors) (#1914)

The top of each form page shows **Starts**, **Completion rate** and **Avg time
to complete** as **distinct visitors**, from Umami's **funnel report**
(`POST /reports/funnel`, `<formId>:form-start → …:form-submit`) — deduped, not
raw event counts. Avg time is the weighted average of the `duration_seconds`
carried on `form-submit`. Alongside sit the field-error and step counters
(`Field errors / start`, `Total field errors`, `Step back`, `Step edit`,
`Reviewed`), which are **event counts**. The `category`/"uncategorised" label is
deliberately not shown.

> Unit note: Umami's funnel report dedupes by **visitor**, whereas the old
> Journeys app deduped by **session**. Equivalent for "how many people got this
> far"; distinct either way.

## Overview forms table — starts & completion

The homepage Forms table lists every published form with **Starts**
(`<formId>:form-start` events) and **Completion** (successful
`<formId>:form-submit` ÷ starts, with the submit count in brackets), pulled in a
single forms-website event-metrics call. These are **event counts** — a quick
per-form summary. The per-form page's funnel (below) is the deduped,
distinct-visitor view; the two can differ, by design. Every table on both pages
is sortable by clicking a column heading.

## The flow (Sankey)

The homepage flow diagram is built from Umami's **journey report**
(`POST /reports/journey`, landing website, first 4 steps). **Column 0 is the
entry page**; each later column is the next step; a link's width is the number
of visits taking that step-to-step transition.

- **Nodes keyed by label.** Nodes are keyed by (column, humanized label), so
  identical steps merge. The generic "Start" (form-start event / `/…/start`
  page) and "Form" (`/…/form` page) labels are **qualified with their root
  service** — e.g. "Get birth certificate · Start" — so they're never ambiguous.
- **Entry pages list.** Below the diagram, the column-0 nodes are listed as an
  "Entry pages" table (visits + share of total entry visits).
- **Steps kept.** Real page paths plus the `form-start` goal; internal tracking
  pseudo-events (`…:page-service-view`, `…:search`, chat, …) are dropped
  (collapsing A → pseudo → B into A → B), consecutive repeats are de-duped, and
  a sequence may not *begin* with the `form-start` event (entries are pages).
- **Percentages.** Each node shows its share of total entry visits; a ribbon's
  hover shows its count and its share of the previous step.
- **Other (N).** The lowest-traffic labels in a column fold into "Other (N)"
  (N = how many were grouped).

It's a hand-rolled SVG (no charting dependency): one teal hue for ribbons, a
green accent for "Start", sized by visit count, with per-node/per-ribbon hover.

## Form detail — step funnel (#1915)

The form page shows a **Start → Step 1…N → Submit** funnel: `Start` =
`form-start`, each `Step N` = the `<formId>:form-step-<n>` count, `Submit` =
`form-submit` (`aggregateFormEvents` + `buildFunnel`). Each row shows the
step-over-step change — a **red −%** when fewer than the previous step reached
it, a **green +%** when more (a step revisited/looped). Two tables follow:

- **Field errors — which fields fail** — `tallyFields(eventDataValues(
  <formId>:form-validation-error, "fields"))`, with each field's % of starts.
- **Why fields fail — validation reasons** — `tallyFields(eventDataValues(
  <formId>:form-validation-error, "errorTypes"))`; known codes (`required`,
  `invalid_format`, …) get a friendly label, the form's own messages pass
  through unchanged.

> **Caveat (unit).** The step funnel and the counters/tables are **event
> counts** — a reload or back-then-forward re-fires them, so a later step can
> exceed an earlier one (hence the green +%). They answer "where do people stall
> within the flow", not "how many distinct people". The headline Starts/Completed
> above are distinct; true distinct-per-step needs the step in the URL (**#1931**).

## Submit reliability — form-submit-error (#1916)

Surfaced as a first-class block on each form page:

- **Errors** = `<formId>:form-submit-error` count.
- **Submit attempts** = successful submits (`<formId>:form-submit`) + submit
  errors.
- **Submit-error rate** = errors ÷ attempts.
- **By reason** = `eventDataValues(..., event: "<formId>:form-submit-error",
  propertyName: "errors")` — `network` (client/network failure), `payment-init`
  (payment could not start), `server` (5xx / server failure).

A failed submission is counted here, **distinct from abandonment** in the funnel:
someone whose submit 500s reached Submit but isn't a "completed", and shows up as
a submit error rather than a silent drop-off.

## Event reference

Emitted by `apps/forms` via `@govtech-bb/analytics` `trackEvent`, which sends the
Umami event name as `<formId>:<event>`:

| Event | Fires when | Key property |
|-------|-----------|--------------|
| `form-start` | form first rendered | — |
| `form-step-view` | a step is rendered (**reached**) | `step` (stepId) |
| `form-review` | leaving the check-your-answers step | — |
| `form-submit` | submission succeeded | `duration_seconds` |
| `form-submit-error` | submission failed | `errors` (network/payment-init/server) |
