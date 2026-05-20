# Umami Tracking — Session Summary

**Date:** 2026-05-20
**Branch:** feat/umami-tracking
**PR:** https://github.com/govtech-bb/gov-bb/pull/6

## What was built

Privacy-friendly analytics on the landing site via Umami Cloud. Pageviews on every TanStack Router resolution; curated click and form-lifecycle events on key elements (header, footer, search, services list, organisations list, breadcrumbs, ministry contacts, helpful box, feedback form, tell-us CTA); slug-prefixed `<slug>-start` events for the root-page → start-page funnel; per-service and per-org named events so each item is a first-class metric in Umami's dashboard. Gated on `VITE_UMAMI_WEBSITE_ID` so dev and unconfigured environments stay silent.

## Why it looks the way it does

**Two-app planning detour.** The plan was drafted twice. The first draft assumed `apps/web` (gov-bb's forms application) and got remodelled around a form-funnel taxonomy (`step-continue`, `form-submit-success-<formId>`, etc.) before the user clarified the work was actually for `apps/landing` (the TanStack Start content site). Landing turned out to be nearly identical to the separate `alphagovbb` repo, so most of the earlier alphagovbb research transferred directly with just path renames and dropping the preview-cookie suppression (landing has no `gov_preview` cookie). The forms-funnel draft is gone; only the final landing-shaped plan survived.

**Disable Umami auto-track, fire pageviews from the router.** The plan as written called for "belt-and-braces" — Umami's auto-tracker plus a manual `router.subscribe('onResolved', ...)` call. That would double-count: TanStack Router uses standard `history.pushState`, which Umami's auto-tracker hooks. I switched to `data-auto-track="false"` plus the manual subscriber so the source of pageviews is deterministic (our app code, not the third-party script). The trade-off is we now own the responsibility of firing pageviews; the upside is no ambiguity about what counts as a navigation and no double-count drift if Umami's auto-track behaviour changes between versions.

**Curated `data-umami-event` tags, not a global click listener.** The user picked Umami's standard pattern (tagged events) over a catch-all click listener early in planning. The dataset is signal instead of noise; the cost is having to remember to add a tag when adding a new CTA. The README documents the three naming shapes so future contributors don't have to reverse-engineer them.

**Three event-name shapes, intentionally:**
- `<surface>-<action>` (e.g. `header-home`, `feedback-submit`) — fixed UI events.
- `<kind>-<slug>` (e.g. `service-renew-passport`, `org-ministry-of-finance`) — per-item clicks from a list.
- `<slug>-<action>` (e.g. `renew-passport-start`) — slug-prefixed CTA events on per-item pages.

The slug-suffixed vs slug-prefixed split is deliberate: `service-X` measures "how many people clicked into service X from the directory", `X-start` measures "how many people on service X's root page clicked through to start the flow". Two different funnel stages, named so they group separately in Umami's UI rather than getting interleaved alphabetically. The README spells this out so the convention survives the people who set it.

**Slug derivation lives in code, not in the markdown.** Content authors write `[Start](/renew-passport/start)` and `rehype-hide-start-links` annotates the anchor with `data-start-link`. In `MarkdownContent.tsx`, the custom `a` component branches on `data-start-link` and now wraps the link in a small `StartLink` React component that calls `useLocation()` for the `from` data and runs `deriveStartEventName(href)` to compute the event name. The alternative — a new rehype plugin to add the attribute at HAST time — was rejected because the existing `a` component already branches on start-link-ness, so adding the analytics there avoids a second plugin in the pipeline and a second place to maintain.

**Footer tags via `onClick`, not `data-*`.** `Footer` from `@govtech-bb/react` accepts a `links` array whose items only support `label`, `href`, and `onClick` — no pass-through for arbitrary attributes. So footer links call `trackEvent('footer-*')` in their `onClick` rather than carrying `data-umami-event` attrs. This is a precedent that may recur with other design-system components: when the component's API doesn't pass `data-*` through, fall back to `onClick` calling `trackEvent`. Long-term, extending the design-system `FooterLink` interface with an `event` field would be cleaner, but that's a separate PR.

**MinistryPage selective tagging.** The plan said "outbound / contact links (confirm during implementation)". I tagged what's high-intent: phone/email/website contacts (with `type` data so we can distinguish call vs email vs visit-site), associated departments (so we can see which orgs people navigate to from a ministry), and the Online Services list (CTA-like). I deliberately didn't tag the Featured items grid (low-volume curated content) or the inline Departments-and-agencies list (we already capture the same orgs via the `/government/organisations` index). If usage patterns reveal we want one of those tracked, easy to add.

**Search query captured as event data, not anonymised.** Search boxes accept service-name queries (e.g. "passport") so capturing the text gives "what people search for" as a directly queryable dimension in Umami. Privacy review still pending in the open questions of the plan, but the precedent matters: this would not be appropriate for the feedback form's free-text fields, where we capture only success/error events.

**`VITE_UMAMI_WEBSITE_ID` gates everything.** When unset (default in `apps/landing/.env.example`), no script is injected at SSR, no requests go to `cloud.umami.is`, and `window.umami` is undefined — every `trackEvent` / `trackPageview` call no-ops. Dev runs are silent. Setting the variable in Amplify is the only step needed to turn analytics on for production; no code change required.

**TDD on the helper.** `analytics.ts` has 9 unit tests covering: no-op when `window.umami` is absent, forwarding `(name)` and `(name, data)` correctly, no-op for pageview when umami is absent, and four cases of `deriveStartEventName` (single-segment, nested path, trailing slash, missing leading slash). The slug derivation in particular is easy to get subtly wrong with regex, so each variant has its own test.

## Decisions worth flagging

- **Naming-convention split** between slug-suffixed (`service-X`) and slug-prefixed (`X-start`). Intentional, but if the team later prefers one direction, it's a rename across event names — Umami event names are free-form, so the cost is "rename in code and re-baseline the metric." Worth deciding before either metric becomes load-bearing.
- **Per-item event explosion.** With ~10s of services and orgs today, per-item named events are fine. If the catalogue grows to 100+ items, switch to one `service-click` / `org-click` event with `slug` as data. The README mentions this; no automation enforces it.

## Key files

| File | Change |
|------|--------|
| `apps/landing/src/lib/analytics.ts` | New — `trackEvent`, `trackPageview`, `deriveStartEventName`; SSR-safe no-op when `window.umami` absent |
| `apps/landing/src/lib/analytics.test.ts` | New — 9 unit tests covering both the helper and slug derivation |
| `apps/landing/src/routes/__root.tsx` | Script injection via `head.scripts` (gated on env var, `data-auto-track="false"`); footer link `onClick` tagging |
| `apps/landing/src/router.tsx` | `router.subscribe('onResolved', trackPageview)` for SPA pageviews |
| `apps/landing/src/components/MarkdownContent.tsx` | New `StartLink` wrapper component for slug-prefixed start events |
| `apps/landing/src/components/{Header,HelpfulBox,Breadcrumbs,FeedbackForm,MinistryPage}.tsx` | `data-umami-event` tags / `trackEvent` calls on relevant elements |
| `apps/landing/src/routes/{index,services,search-results,government.organisations.index}.tsx` | `onSearch` callbacks for search tracking, per-item named events on lists, CTA tags |
| `apps/landing/.env.example` | New — documents `VITE_UMAMI_WEBSITE_ID` and `VITE_UMAMI_SRC` |
| `apps/landing/README.md` | New Analytics section explaining the env gate, how pageviews/events flow, and the three naming shapes |
| `docs/plans/umami-tracking.md` | Plan that this PR implements |

## Verification

- `npm run test` (in `apps/landing`) — 36/36 pass, 9 new for analytics
- `npm run lint` — clean
- `npm run build` — succeeds
- `npm run typecheck` — fails on a pre-existing error in `src/content/registry.ts:35` that exists on `dev` and is unrelated to this PR; flagged for separate follow-up
- End-to-end browser smoke test was not done this session: `npm start` is broken upstream (`node --import dist/server/server.js` resolves `dist` as a package name; needs `./dist/...`) and port 3000 was occupied by another process. Build + unit tests + type-checking of `data-*` attributes (via `HTMLAttributes` types) cover the runtime risk. The PR's verify checklist asks the human reviewer to load the dev server and click through.
