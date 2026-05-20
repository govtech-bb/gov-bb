# Umami tracking (landing)

## Goal

Measure how visitors use the landing site: which pages they view, how they get there, and which interactions they take. Use Umami Cloud (privacy-friendly, cookieless) with curated event names so the data is signal, not noise.

> **Scope:** This plan applies to `apps/landing` only — the public TanStack Start landing site. It does **not** cover `apps/web` (the forms app) or `apps/api`.

## Approach

**Chosen:** Umami Cloud, script loaded in the SSR shell, gated by env-var presence so it only ships when configured. Pageviews are fired both by Umami's built-in history listener and by a manual `umami.track()` on TanStack Router resolution (belt-and-braces — TanStack Start's SPA navigation behaviour with Umami's auto-tracker isn't documented, and a manual subscriber is one line of safety). Click events use Umami's standard `data-umami-event` attribute pattern on a curated list of elements.

**Considered and rejected:**

- **Global click-listener catch-all.** Captures every click but produces noisy, low-signal data and is not how Umami is designed to be used.
- **Plausible / GA4.** Out of scope — the team picked Umami Cloud.
- **Preview-cookie suppression** (as in the alphagovbb plan). Not applicable: landing has no `gov_preview` cookie or draft-pages mechanism. If a similar preview system is added later, revisit so reviewer traffic doesn't pollute analytics.

## Scope

### Script + bootstrapping

- Read `VITE_UMAMI_WEBSITE_ID` and `VITE_UMAMI_SRC` (default `https://cloud.umami.is/script.js`) at SSR time in `__root.tsx`.
- If `VITE_UMAMI_WEBSITE_ID` is unset, render nothing. This is the gate that keeps dev / unconfigured environments quiet.
- Otherwise inject `<script defer data-website-id="…" src="…"></script>` into `<head>` via the route's `head.scripts` array.

### SPA pageview tracking

- In `router.tsx`, after `createTanStackRouter(...)`, subscribe to `onResolved` and call `window.umami?.track()` to fire a pageview for the new URL. Guarded so it no-ops when Umami isn't loaded (dev, unconfigured). The initial pageview is handled by Umami's auto-track on script load.

### Event instrumentation (curated)

Tag the following with `data-umami-event="..."` and, where useful, `data-umami-event-*` attributes for properties:

| Surface | Element | Event name | Event data |
|---|---|---|---|
| Header | Logo link → `/` | `header-home` | — |
| Footer | "Home" link | `footer-home` | — |
| Footer | "Terms & Conditions" link | `footer-terms` | — |
| Footer | "Careers" link | `footer-careers` | — |
| Search (on `/services`) | Form submit | `search-submit` | `query` (the entered text), `source: "services"` |
| Search (on `/search-results`) | Form submit | `search-submit` | `query`, `source: "results"` |
| Services list (`/services`) | Each service item link | `service-<slug>` (per-service named event, slug-derived) | `title` |
| Government organisations list (`/government/organisations`) | Each org link | `org-<slug>` (per-org named event) | `name` |
| Root service page → `/start` CTA (in markdown content, renders as `LinkButton`) | The `data-start-link` anchor | `<slug>-start` (slug-prefixed) where `<slug>` is the path between leading `/` and trailing `/start`, with intermediate slashes replaced by `-` | `from` (the root pathname the user clicked from) |
| HelpfulBox | "Help us improve" link | `helpful-feedback` | `path` (current pathname) |
| FeedbackForm | Submit button | `feedback-submit` | — |
| FeedbackForm | On success state shown | `feedback-success` | — (fire via `umami.track()` in the success effect) |
| FeedbackForm | On error state shown | `feedback-error` | `reason: "validation" \| "server"` |
| Tell Us | CTA link → `/tell-us` (homepage + anywhere else it appears) | `tell-us-cta` | `source` (the route the click came from) |
| Tell Us page | Submit (if it has a form distinct from FeedbackForm) | `tell-us-submit` | — |
| Breadcrumbs | Each crumb click | `breadcrumb` | `to` (destination href), `depth` (index) |
| MinistryPage | Outbound / contact links (confirm during implementation) | `ministry-link` | `org` (org slug), `href` |

**Notes on the event-data choices:**

- **Search query is captured as `query` data.** This makes "what people search for" queryable in Umami's events view. Acceptable from a privacy perspective because the box is intended for service-name searches and the rest of the site is cookieless/no-PII. If we ever expect freeform input, revisit.
- **Per-service and per-org named events** mean one event name per service or organisation (e.g. `service-renew-passport`, `org-ministry-of-finance`). Sustainable while the alpha catalogue is small; if either set grows large we may switch to one `service-click` / `org-click` event with slug data — flag this in code review when adding.
- **Start-CTA events are slug-prefixed** (`<slug>-start`), distinct from `service-<slug>` (slug-suffixed) so they appear as a separate group in Umami's events list. The two event families measure different funnel stages:
  - `service-<slug>` answers "how many people clicked into a service from the directory?"
  - `<slug>-start` answers "how many people on a service's root page actually clicked through to start the flow?"
  Comparing the two for a given service gives the bounce rate on the root page. Naming intentionally chosen to keep them grouped distinctly in Umami's UI.
- **Start-CTA slug derivation:** the start link's href is the service path with a `/start` suffix (e.g. `/renew-passport/start` or `/travel/renew-passport/start`). The slug is built by stripping the leading `/` and trailing `/start`, then replacing any remaining `/` with `-`. So `/renew-passport/start` → `renew-passport-start`, and `/travel/renew-passport/start` → `travel-renew-passport-start`. Done once in `markdownComponents.a` so authors don't need to manually annotate links.

### Form submission events that aren't simple clicks

`feedback-submit`, `feedback-success`, `feedback-error`, and `tell-us-submit` fire from React effects after the form action resolves (not from raw `data-umami-event` on the button), because we want to distinguish submitted-then-validated from submitted-then-server-errored. Implementation pattern:

```ts
useEffect(() => {
  if (state.success) trackEvent('feedback-success')
}, [state.success])
```

A small typed wrapper (`apps/landing/src/lib/analytics.ts`) exposes `trackEvent(name, data?)` that no-ops when `window.umami` is absent, so component code doesn't need defensive checks.

### Documentation

- Create `apps/landing/.env.example` (none exists today): include `VITE_UMAMI_WEBSITE_ID=` and a commented `# VITE_UMAMI_SRC=` with a note explaining the gating behaviour.
- `apps/landing/README.md`: short "Analytics" section under existing top-level sections — what Umami tracks, how the env-var gate works, and the event-naming convention so future contributors don't drift.

## Files

**Modify:**

- `apps/landing/src/routes/__root.tsx` — inject Umami script via `head.scripts`, gated on env var. Tag footer links with `data-umami-event` (see note in "Possibly modify" below about `Footer` from `@govtech-bb/react`).
- `apps/landing/src/router.tsx` — subscribe to `onResolved` and call `umami.track()`.
- `apps/landing/src/components/Header.tsx` — add `data-umami-event` to logo link.
- `apps/landing/src/components/HelpfulBox.tsx` — add `data-umami-event` + `data-umami-event-path` to the feedback link.
- `apps/landing/src/components/FeedbackForm.tsx` — call `trackEvent` from submit / success / error effects.
- `apps/landing/src/components/Breadcrumbs.tsx` — add `data-umami-event` per crumb.
- `apps/landing/src/components/MinistryPage.tsx` — tag outbound / contact links.
- `apps/landing/src/components/MarkdownContent.tsx` — in `markdownComponents.a`, when the anchor is a start link (`data-start-link` present or href ends with `/start`), derive the slug from the href and pass `data-umami-event="<slug>-start"` and `data-umami-event-from={typeof window !== 'undefined' ? window.location.pathname : ''}` to `LinkButton`. Considered an alternative: a new rehype plugin `rehype-tag-start-links.ts` matching the existing `rehype-hide-start-links` pattern. Rejected — adding two attributes inside the existing custom `a` component is simpler and already where start-link branching lives.
- `apps/landing/src/routes/services.tsx` — tag the search form submit and each service item link.
- `apps/landing/src/routes/search-results.tsx` — tag the search form submit.
- `apps/landing/src/routes/government.organisations.index.tsx` — tag each org link with `data-umami-event="org-<slug>"`.
- `apps/landing/src/routes/government.organisations.$slug.tsx` — tag any outbound links on the individual org page.
- `apps/landing/src/routes/index.tsx` — tag the "Tell us" CTA if present.
- `apps/landing/src/routes/tell-us.tsx` — tag CTA / submit.
- `apps/landing/README.md` — short Analytics section.

**Add:**

- `apps/landing/.env.example` — document the new env vars (no existing file in this app).
- `apps/landing/src/lib/analytics.ts` — `trackEvent(name, data?)` helper + the `Umami` window-global typing.
- `apps/landing/src/lib/analytics.test.ts` — covers: no-op when `window.umami` is absent; forwards args when present.

**Possibly modify (check during implementation):**

- `apps/landing/src/routes/__root.tsx` (footer block). The footer is rendered via `Footer` from `@govtech-bb/react` with a `FOOTER_LINKS` array. Confirm whether `Footer` lets us attach `data-umami-event` per link. If not, the per-link instrumentation needs either (a) extending `FOOTER_LINKS` with an `event` field and updating the design-system component, or (b) replacing this app's usage with a lightweight inline footer. (a) is the right long-term answer.

## Verify

Commands assume you're inside `apps/landing/` (or use `npx nx <target> landing` from the repo root, since gov-bb is an Nx workspace).

- `npm run typecheck` and `npm run test` pass.
- `npm run build` succeeds with `VITE_UMAMI_WEBSITE_ID` set in the environment.
- With `VITE_UMAMI_WEBSITE_ID` **unset**: HTML source contains no `umami` script, no `cloud.umami.is` network request, no console errors.
- With it **set** in a local prod build (`VITE_UMAMI_WEBSITE_ID=... npm run build && npm start`): script loads, initial pageview fires, SPA navigations fire pageviews on `onResolved`.
- Click each tagged element; confirm the event name + data appears in Umami's realtime events view.
- Search "passport" on `/services`: a `search-submit` event with `query: "passport"`, `source: "services"` arrives.
- Click a service from `/services`: `service-<that-slug>` event arrives.
- Click an organisation from `/government/organisations`: `org-<that-slug>` event arrives.
- Visit a service root page that has a start CTA (e.g. `/renew-passport`), click the start button: a `renew-passport-start` event arrives with `from: "/renew-passport"`. Repeat for a nested-path service to confirm dash-joining works.
- Submit the feedback form with empty fields → `feedback-error` with `reason: "validation"`. Submit successfully → `feedback-submit` then `feedback-success`.

## Open questions

- **Umami Cloud account.** Confirm the website ID and (if custom) script URL before merging. Where do production env vars live for landing — Amplify console, GitHub Actions, both?
- **MinistryPage links** — exact list of trackable elements pending a read of the component when we implement.
- **`Footer` component capability.** See "Possibly modify" above.
- **Per-service / per-org event explosion.** Acceptable while the catalogue is small; revisit threshold (~50 items?) for switching to a single generic event with slug data.
- **Preview / draft-pages mechanism.** Landing doesn't have one today. If one is added later (mirroring alphagovbb's `gov_preview` cookie), add server-side suppression so reviewer traffic doesn't skew analytics.
- **Start-CTA event-name collision risk.** A service whose slug happens to end in something like `-search` or `-feedback` could theoretically collide with the fixed event names (`search-submit`, `helpful-feedback`). Extremely unlikely in practice — slugs are content-author-controlled and prefixed by their service identity — but worth a quick lint when adding the helper. Easiest mitigation: if it ever happens, the slug renames or the fixed event gets a more specific name.
- **Naming-convention split** (`service-<slug>` vs `<slug>-start`). Intentional per the discussion above, but if the team later prefers one direction (e.g. all slug-first), we can rename in a follow-up. Umami event names are free-form strings, so the migration cost is "rename in code + re-tag historical data is impossible / would re-baseline metrics." Worth deciding before the metric becomes load-bearing in any review.
