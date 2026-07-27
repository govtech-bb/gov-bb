# Umami analytics dashboards — metric evaluation

_Evaluation of the two Umami-backed analytics dashboards, the metrics each
presents, how each is computed, and where they agree, differ, or fall short.
Generated from source on `sandbox` (2026-07)._

## The two dashboards

| | **A — Analytics report** | **B — Journeys** |
|---|---|---|
| URL | `analytics.sandbox.alpha.gov.bb` | `govbb-journeys-*.netlify.app` |
| Source | in-repo `apps/analytics` + `packages/umami-analytics` | separate repo `govtech-bb/govbb-umami-analytics` |
| Data | **static committed snapshot** (`analytics-snapshot.json`, regenerated offline via `pnpm generate:analytics`) | **live Umami Cloud API** per build (`/websites/:id/sessions` + `/sessions/:id/activity`) |
| Unit of counting | **events** (Umami `/metrics?type=event`) | **distinct sessions** (reconstructed from session activity) |
| Window | 5 presets: today / 7 / 30 / 60 / 90 days | single window, default **last 30 days** (`--days N`) |
| Freshness | as of last snapshot run (see "Last updated") | as of last `./redeploy.sh` (manual/on-demand) |
| Lens | **depth per form** | **cross-journey flow** |

Both read the same Umami event stream (autotrack **off**; all events fired
manually — see [umami-tracked-actions.md](./umami-tracked-actions.md)). Device /
country / entry / exit come from Umami's session metadata (reliable); everything
form-related depends on the app firing the right events per step.

---

## Dashboard A — metrics & evaluation

| Section | Metrics | Derivation | Evaluation |
|---|---|---|---|
| **Top pages** | Path, Pageviews, Visitors, Top source | untagged pageviews + referrer | ✅ Standard, sound. |
| **Top forms** | Starts, Completion % | `starts` = `form-start` events; `completion% = form-submit / form-start` | ⚠️ **Event-counted, not per-session** — `form-start` fires per mount, so reloads/re-entries inflate starts and depress completion %. Read completion % as a floor. |
| **Form detail — KPIs** | Starts, Completed (+%), Avg time to complete, Field errors/start, Total field errors | avg time = mean `duration_seconds` on `form-submit` | ✅ High-value. ⚠️ Avg time is **completers only** (survivorship) → understates real effort. |
| **Form detail — friction** | Step back, Step edit, Reviewed | `form-step-back` / `-edit` / `-review` counts | ✅ Useful qualitative signal. |
| **Form detail — funnel** | Start → Step 1…N → Submit + drop-off % | `form-step-<word>` + start + submit **event counts** | ⚠️ Step = step *completed* (Continue+valid), not *reached*; counts **events not sessions** (see §Cross-cutting). |
| **Form detail — field errors** | Field, Errors, % of starts | `form-validation-error.fields` tally | ✅ Strong — pinpoints failing fields. |
| **Form detail — validation reasons** | Reason label, code, occurrences, share | `form-validation-error.errorTypes` decoded to plain English | ✅ Best-in-class; the code→label decoding is excellent. |
| **Search** | Submissions total, by source, top queries; results-page searches, **no-results rate**, top queries | `search-submit` + `search` events | ✅ Good; correctly notes click-through isn't tracked (no-results rate is the proxy). |

**Not surfaced (though tracked):** `form-submit-error` (failed submissions — a
real blind spot for A), `form-file-select`, `form-step-view`, and all landing
engagement events (`chat-*`, `feedback-*`, `footer-*`, `page-service-view`,
`page-start-view`).

---

## Dashboard B — metrics & evaluation (source-verified)

Sessions are reconstructed from `/sessions/:id/activity` (ordered pageviews +
custom events); immediate page repeats are collapsed; custom events are folded
out of the page flow. Step identity comes from the **`?step=` URL query param**
(repeating sections collapsed), ordered by **mean positional rank** across
sessions — not from the event name.

| Section | What it measures | Derivation | Evaluation |
|---|---|---|---|
| **The flow — first few steps** | Sankey of entry navigation; link width = sessions making that page→page transition | per-depth transition tally over session page sequences (top ~7 pages/depth, rest "Other") | 🆕 The lateral-flow view A lacks. ✅ Session-based. ⚠️ Page-only (events excluded); depth-limited. |
| **Most common journeys** | Top ~25 complete page sequences | `pages.join(" › ")` tallied, with session count + % | ✅ Real path frequency. ⚠️ Cookieless session stitching → one person can split across sessions. |
| **Where people drop off** | Biggest single-step session loss per service | largest `count[i-1] − count[i]` across funnel steps (abs + %) | ✅ Good cross-service ranking of the worst drop; complements A's per-form funnel. |
| **Form funnels** | **Distinct sessions** reaching each real step | `Set` of session IDs per `?step=` slug; friction/`form-submit-error` ingested too | ✅ More honest funnel than A. See §Cross-cutting for why numbers differ. |
| **Validation errors (all forms)** | Field / reason / step failure tallies across all forms | `event-data/values` on `form-validation-error` (`fields`, `errorTypes`, `step`) — **event-counted** | 🔁 Overlaps A's per-form table; aggregated all-forms. Note: this section is event-counted, not session-deduped. |
| **Entry pages** | First page per session | `tally(j.pages[0])` | ✅ Session-native; not in A. |
| **Exit pages** | Last page per session | `tally(j.pages.at(-1))` | ✅ Session-native; not in A. |
| **Devices** | Sessions by device (top 6) | session metadata | ✅ Reliable (Umami UA-derived). |
| **Countries** | Sessions by country (top 8) | session metadata | ✅ Reliable (Umami IP-derived). |
| _(also computed)_ **Bounce rate** | single-pageview sessions ÷ total | `j.bounce` | ✅ Standard. |

B also runs Puppeteer to **screenshot each form step** (`walk-forms.mjs`) for a
visual companion to the funnel — a capability A has no equivalent of.

---

## Cross-cutting evaluation

1. **The funnels will not match — by design.** A counts **events**
   (`form-step-<word>` occurrences); B counts **distinct sessions** reaching a
   step (deduped by session ID, step from `?step=`). A generally reads higher
   (reloads/back-nav re-fire events). Same form, same window, different numbers —
   expected, not a bug. **B's session funnel is the more trustworthy one.**
2. **"Step" = completed, not reached (both).** Both build on `form-step-*`, which
   fires on Continue+valid — i.e. step completion. `form-step-view` (reached) is
   tracked but unused, so "Start → Step 1" drop-off conflates "left before
   finishing step 1." Using `form-step-view` would give a truer reached-vs-completed funnel.
3. **Completion % is a floor (A).** Per-mount `form-start` + on-success
   `form-submit` understates completion (reload inflation) and misses
   payment-gated success arriving later.
4. **Failed submissions:** A **does not surface** `form-submit-error` at all; B
   at least **ingests** it as a funnel friction signal. Neither shows it as a
   first-class reliability metric — the biggest metric gap for an observability lens.
5. **Complement, not duplicate.** They overlap only on form funnels + validation
   errors. A owns per-form depth (avg time, field-level errors, decoded reasons,
   search quality); B owns cross-journey flow (Sankey, common paths, drop-off
   ranking, entry/exit, devices, countries, bounce). Keep both.
6. **Freshness mismatch.** A is a static snapshot (only as fresh as the last
   generate run); B is live per redeploy (default 30-day window). Don't compare a
   stale A preset against a fresh B build.
7. **Shared trust floor.** Both depend on manual event firing (autotrack off).
   Device/country/entry/exit (from Umami's beacon/session metadata) are the most
   reliable; form funnels are only as good as the per-step event instrumentation.
   Cookieless sessions mean "distinct sessions" ≠ distinct people.

---

## Verdict

- **Dashboard A** — trustworthy for **per-form diagnostics** (which field fails,
  why, time-to-complete, search quality). Caveats: event-counted funnel,
  completers-only timing, no failed-submits, snapshot freshness.
- **Dashboard B** — the **journey/flow** view A lacks (Sankey, common paths,
  drop-off ranking, entry/exit, devices, countries, bounce), on a sounder
  **session** basis. Caveats: 30-day single window, manual redeploy, cookieless
  session stitching.

## Recommended improvements (both)
- Standardise the funnel on **distinct sessions** (adopt B's method everywhere).
- Add a `form-step-view`-based **reached-vs-completed** funnel for true drop-off.
- Surface **`form-submit-error`** as a first-class reliability metric.
- Reconcile A ↔ B (shared definitions / one source) so numbers agree.
- Note snapshot vs live freshness on each dashboard so viewers don't mis-compare.

_Sources: `apps/analytics/src/AnalyticsPage.tsx`, `packages/umami-analytics/src/{metrics,types}.ts`
(Dashboard A); `govtech-bb/govbb-umami-analytics` `journeys.mjs` / `validation-errors.mjs`
(Dashboard B); event catalogue in [umami-tracked-actions.md](./umami-tracked-actions.md)._
