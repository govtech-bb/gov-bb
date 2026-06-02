# Landing App — Feature Specification

This document captures the intended features of the **landing** app (`apps/landing`) — the public-facing site for **alpha.gov.bb**, the Government of Barbados' alpha government services portal. It focuses on *what* the app does rather than *how* it's implemented. Items the team should confirm or clarify are collected in the **Open questions** section at the end.

---

## 1. Purpose

The landing app is the citizen-facing entry point to the alpha programme of digital government services. It exists to help people in Barbados:

- Find a government service.
- Read clear, plain-English information about how that service works.
- Start a digital service by handing the citizen off to the forms app, when one exists.
- Use interactive tools (calculators, decision-trees) that give immediate answers without leaving the site.
- Feed back to the team about what's working and what isn't.

The site clearly signals its **alpha** stage and the migration relationship with the legacy `gov.bb`.

---

## 2. Site-wide features

### 2.1 Global layout

- A site-wide layout wraps every route with:
  - An **official-website banner** at the top (coat of arms + "Official government website" caption).
  - An **alpha stage banner** linking to `/what-we-mean-by-alpha`. This is suppressed on organisation pages that have been migrated from gov.bb (those carry a different banner).
  - A **header** with the alpha.gov.bb logo, linking home.
  - A **footer** with Home, Terms & Conditions and Careers links, plus a Barbados Coat of Arms and copyright line.
- Pages render server-side via TanStack Start (Nitro, AWS Amplify preset) and hydrate on the client.
- Per-page `<title>` and `<meta name="description">` are set from route definitions or markdown frontmatter.

### 2.2 Error / fallback pages

- **404 (page not found)** — friendly message, suggestions and CTAs to the homepage or services directory.
- **Server error** — generic "something went wrong" page used as the route error boundary.
- **`/service-unavailable`** — explicit maintenance / overload page.
- **`/javascript-required`** — guidance to enable JavaScript or update the browser.

### 2.3 Stage / provenance signalling

- An **alpha banner** appears on most pages, indicating the work is in progress and likely to change.
- A **migration banner** appears on pages whose markdown declares a `source_url` in frontmatter, calling out that the content originally came from `gov.bb`, optionally with a link to view the original. The same pattern is used at the top of migrated organisation pages.

### 2.4 Accessibility

- The site uses the shared `@govtech-bb/react` / `@govtech-bb/design` design system for typography, colour, and interactive primitives (buttons, inputs, radios, checkboxes, error summaries, date inputs, etc.).
- Forms use **error summaries with focus management**, semantic labels, and visible field-level errors.
- Skip-to-main is implicit via a `<main id="main">` landmark.
- Phone-number cells in markdown tables are auto-converted to `tel:` links.

---

## 3. Homepage (`/`)

A three-section landing page:

1. **"How you find and use government services is changing"** hero with a CTA into the *Tell us what's important* feedback page.
2. **Alpha services** panel — a description, a **search bar**, and a "View all services" link to `/services`.
3. **Government services** — a list of all top-level service categories (e.g. *Family, birth and relationships*, *Work and employment*, *Travel, ID and citizenship*, etc.) linking into each category page.
4. A **HelpfulBox** ("Was this helpful?") prompting feedback.

---

## 4. Service catalog and content pages

### 4.1 Categories and subcategories

A static catalogue of citizen-facing categories is defined in `src/content/categories.ts`. Each has a slug, title, optional description, and optional subcategories. Currently the categories include:

- Family, birth and relationships
- Work and employment
- Money and financial support
- Pensions and Gratuities
- Youth and Community Programmes *(has subcategories: youth development, skills & trades, entrepreneurship, arts & culture, children & families)*
- Travel, ID and citizenship
- Business and trade
- Public safety

The category list is the single source of truth — adding a new content page under a category that doesn't exist is a **build error**, by design.

### 4.2 Markdown-driven content

Each service or informational page is authored as a Markdown file under `src/content/`. Frontmatter is validated with Zod and supports:

| Field | Purpose |
|---|---|
| `title`, `description` | Page metadata and SEO. |
| `category` / `categories[]` | Which category (or categories) the page is listed under. |
| `subcategory` | Optional sub-grouping; must belong to one of the page's categories. |
| `publish_date` | Surfaces a "Last updated on …" stamp. |
| `source_url` | Triggers the migration banner with a link to the original gov.bb page. |
| `stage` | `alpha` flag used by the `/services` list. |
| `service_type` | `digital` or `information`. |
| `form_id` | Identifier of the corresponding form in the forms API. Drives **Start now** buttons (see §6). |

The full registry of pages is built at startup from the markdown tree, with category/subcategory validation enforced.

### 4.3 Category, subcategory and page routing

A single catch-all route resolves URLs in priority order:

- `/<category>` — if the slug matches a category:
  - If the category has subcategories, render the list of subcategories.
  - Otherwise, render an alphabetical list of all pages in that category.
- `/<category>/<subcategory>` — render the list of pages in that subcategory.
- Any other path — try to match a content page by URL.
- Otherwise — show the 404 page.

All category / subcategory / detail views share a shell with **breadcrumbs** (Home > Category > …) and a **HelpfulBox** at the bottom. Form pages (`…/form`) deliberately omit breadcrumbs.

### 4.4 Markdown rendering

Markdown is rendered with custom components that:

- Replace headings, paragraphs, lists, tables, links, and blockquotes with design-system equivalents.
- Wrap content into semantic sections on `<h2>`/`<h3>` boundaries (`rehype-sectionise`).
- Auto-link phone numbers in tables to `tel:` URIs.
- Render external links as new-tab links with appropriate styling.
- Honour `<a data-start-link>` markers (see §6).
- Strip "/start" links and adjust "There are N ways to apply" copy when the viewer does **not** have research access (`rehype-hide-start-links`).

### 4.5 All services list (`/services`)

A standalone, alphabetised index of all pages where `stage: alpha` and the slug is *not* a `…/start` page. Each entry is labelled **Digital service** if a corresponding `…/start` page exists, otherwise **Information service**. The page also shows a search bar.

---

## 5. Search (`/search-results`)

A client-side full-text search across services, ministries, departments and state bodies, powered by MiniSearch.

- A search bar appears on the home page, `/services`, and `/search-results`. Submission navigates to `/search-results?q=<query>`.
- The index is built once from page bodies plus organisation entries; document fields include title, description, body, and a synthesised **keywords** field.
- The keyword field expands titles into:
  - **Acronyms** of the org name (e.g. *Barbados Revenue Authority* → BRA).
  - **Synonyms** for common government terms (tax, licence, health, school, passport, ID, police, pension, business, civil registration, jobs, water, electricity, transport).
- Search options use boosted weights (`keywords:5, title:4, description:1.5, body:0.3`), AND combination, prefix matching, and fuzzy matching for terms longer than 3 characters. Stopwords are filtered out.
- Hits are presented as a list with title, description (on desktop), and a kind label (Information service / Ministry / Department / State body).
- Empty queries show helpful suggestions and a link to browse all services.

---

## 6. Cross-app "Start now" buttons

A documented convention links the landing site to the **forms app**:

- A markdown page declares `form_id: <id>` in frontmatter.
- A marker anchor `<a data-start-link>Start now</a>` is placed where the button should appear in the body.
- A **build-time script** (`scripts/fetch-form-manifest.mjs`) hits `${VITE_FORMS_API_URL}/form-definitions` during `predev` and `prebuild`, validates the response, and writes a generated module `src/content/available-forms.gen.ts` exporting the set of available form IDs. The build **fails** if the API is unreachable.
- At render time the Markdown component only renders the button if `form_id` ∈ `AVAILABLE_FORMS`. Otherwise the button is silently suppressed (with a `console.warn` in dev to catch authoring typos).
- The button links to `${VITE_FORMS_URL}/forms/<form_id>` and emits an analytics event `<form_id>-start`.

This is governed by **ADR-0005** in the monorepo docs.

---

## 7. Bank holiday calendar (`/bank-holiday-calendar`)

A standalone reference page listing Barbados public holidays:

- Holidays are computed from rules (fixed dates, anonymous-Gregorian Easter algorithm, Nth-weekday rules) and the Public Holidays Act, Cap. 352 substitution rules for weekend-falling holidays.
- A **year switcher** lets the user navigate between years within `[MIN_YEAR=2020, MAX_YEAR=2050]`. The selected year is stored in the URL search params.
- For the current year:
  - A **"Next bank holiday" hero** shows the next upcoming holiday with a countdown ("Today" / "Tomorrow" / "N days away").
  - Holidays are split into **Upcoming** and **Past** lists.
- For past or future years a single "All bank holidays" list is shown.
- A substitution-rules info box explains when a holiday falling on a weekend is observed on the Monday (or Tuesday for Emancipation Day and Christmas Day).
- Each row shows month/day chip, name, optional note, "Observed: …" tag for substitution days, and the day of the week.
- An "About this list" footer links out to the Ministry of Labour's official list.

---

## 8. Interactive blocks (calculators / wizards)

Three custom interactive flows are mounted as dedicated routes outside the markdown registry. Each follows a "form steps → result" pattern with error summaries, focus management and design-system inputs.

### 8.1 Severance pay calculator
**Route:** `/money-financial-support/calculate-severance-pay/form`

Steps: self-employed (yes/no) → reason sent home → start/end dates → average pay & period (weekly/monthly) → result.

Logic implements the Severance Payments Act, Cap. 355A:
- Tiered weeks of pay: 2.5 weeks/year for years 1–10, 3 for 11–20, 3.5 for 21–33.
- Only the most recent 33 years count.
- Average weekly pay is derived from declared pay, with year-specific **maximum insurable earnings ceilings** applied.
- Returns either:
  - **Ineligible** (self-employed, reason not covered, or under two years).
  - **Eligible** with money estimate, the tier breakdown, an illustrative "gap weeks" example explaining why the result is only an estimate, and NIS post-claim process info.

### 8.2 Pension calculator
**Route:** `/pensions-and-gratuities/calculate-your-pension/form`

Inputs: months of pensionable service, last annual salary. Validates positive integers / amounts and returns a pension estimate (with warnings for low service months). Implementation lives in `src/blocks/pension/compute.ts`.

### 8.3 Crop Over permits checklist
**Route:** `/business-trade/crop-over-permits/form`

A four-question wizard asking about event type, venue, expected size and event features (music, alcohol, food, stage, tickets, pyro, copyrighted music), then producing a **prioritised permit checklist** with:

- Permit name, agency, urgency badge (urgent / amber / green / normal) and lead-time text.
- "Documents required" and "Documents and fees required" reveals.
- "How to apply" with online links and in-person addresses / phone / email.
- A **"Save checklist as PDF"** button that uses `window.print()` after force-expanding all `<details>`.
- An advisory note clarifying that the guidance is indicative, not legal advice.

### 8.4 Shared patterns across blocks

- Single-question-per-step UX with Previous / Continue navigation and explicit error summaries.
- Re-usable money formatter for BDS currency.
- "Service title" strip linking back to the parent service page.
- "Start again" controls on the result step.

---

## 9. Feedback channels

Two distinct ways for citizens to talk back to the team:

### 9.1 Page-level feedback (`/feedback`)

Reached from the **HelpfulBox** at the bottom of most pages. Features:

- Two free-text fields: *Why did you visit alpha.gov.bb?* and *What went wrong?*
- The originating page URL is captured via `sessionStorage` (`feedbackReferrer`) and sent as a hidden field.
- Submission goes through a **TanStack Start server function** (`sendFeedback`), with Zod validation requiring at least one of the two fields filled.
- Validation errors trigger an inline ErrorSummary that scrolls into view and is focused.
- Success state shows a "Thank you for your feedback" panel with a "Tell us something else" option that re-opens the form.
- Analytics events fire on submit, success, and error (split into validation vs server reason).

### 9.2 "Tell us what matters" (`/tell-us`)

A page that embeds an **external Tally form** ("Help Us Improve Government Services in Barbados") via iframe. Tally's embed script is loaded server-side via the route's `<head>`.

---

## 10. Analytics

Umami Cloud is wired in with these properties:

- **Opt-in by env var**: the Umami script is only injected when `VITE_UMAMI_WEBSITE_ID` is set. Local dev with the var unset emits no events, keeping dev traffic out of the dataset.
- **Auto-tracking disabled** (`data-auto-track="false"`); the app sends everything manually.
- **Pageviews** are fired by subscribing to the router's `onResolved` lifecycle — one event per resolved route, including SPA navigations.
- **Click and lifecycle events** use either `data-umami-event="..."` attributes or `trackEvent()` calls from React effects.
- A typed helper in `src/lib/analytics.ts` (`trackEvent`, `trackPageview`, `deriveStartEventName`) safely no-ops when Umami isn't loaded.
- A documented naming convention covers fixed UI surfaces (`<surface>-<action>`), per-service and per-org clicks, and per-form `Start now` events.

---

## 11. Routing summary

| Path | Purpose |
|---|---|
| `/` | Homepage. |
| `/services` | All-alpha services index with search. |
| `/search-results` | Search results (validated `?q=`). |
| `/<category>` | Category index or list of subcategories. |
| `/<category>/<subcategory>` | Subcategory list. |
| `/<any>/<segments>` | Markdown content page lookup. |
| `/bank-holiday-calendar` | Public holidays page with year switcher. |
| `/feedback` | Page-level feedback form. |
| `/tell-us` | Embedded Tally feedback form. |
| `/business-trade/crop-over-permits/form` | Crop Over permits wizard. |
| `/money-financial-support/calculate-severance-pay/form` | Severance calculator. |
| `/pensions-and-gratuities/calculate-your-pension/form` | Pension calculator. |
| `/javascript-required` | "Please enable JavaScript" landing page. |
| `/service-unavailable` | Generic maintenance / overload page. |

---

## 12. Environment / configuration contract

The landing app expects the following environment variables (documented in `.env.example`):

| Variable | When used | Purpose |
|---|---|---|
| `VITE_FORMS_API_URL` | build time | Source of the forms manifest fetched in `predev`/`prebuild`. |
| `VITE_FORMS_URL` | render time | Base URL used in Start now button hrefs. |
| `VITE_UMAMI_WEBSITE_ID` | render time | Enables Umami analytics. Unset = no events. |
| `VITE_UMAMI_SRC` | render time | Optional override for the Umami script source. |

---

## 13. Open questions / things to confirm

These are points I noticed during exploration but couldn't fully resolve. Flagging them so the team can decide.

1. **`/contact` referenced but not implemented.** The 404, server-error, `javascript-required`, and `service-unavailable` pages all link to `/contact` as a secondary CTA, but no `/contact` route exists. Should it be added, or should those links go to `/feedback` / `/tell-us`?
2. **`hasResearchAccess` flag.** `MarkdownContent` and `rehype-hide-start-links` accept a `hasResearchAccess` prop that gates whether `…/start` links are hidden and whether "There are N ways to apply" copy is rewritten. I couldn't find any code path that actually passes `hasResearchAccess: true`. Is this scaffolding for an upcoming gated-research feature, or is it intended to be wired up to a specific role / cookie / query param now?
3. **Feedback submission is stubbed.** `sendFeedback` validates and then only `console.log`s the data — a comment says *"SES integration deferred — log the submission for now."* Worth confirming what the long-term backend is meant to be (SES email? a database? a Slack hook?) and whether this is currently providing any real signal.
4. **`/tell-us` Tally embed.** Is the embedded Tally form a permanent solution, or interim while the in-house feedback flow matures? Either way, the dependency on a third-party iframe is worth flagging from a content-ownership and analytics-coverage perspective.
5. **`/javascript-required` is reachable but not enforced.** There's a `/javascript-required` route and a friendly page, but I didn't see any `<noscript>` redirect, middleware, or progressive-enhancement check that actually routes users there. How is this page intended to surface to the no-JS user?
6. **Form-route exceptions to the splat router.** The crop-over, severance and pension calculators are exposed as explicit routes under category paths (`/business-trade/crop-over-permits/form`, etc.) rather than as markdown pages. Is the intent that any future calculator-style flow follows this `<category>/<service>/form` pattern, or could some of them live entirely in the splat-routed markdown registry?
7. **Bank-holiday data sources.** Holiday dates are computed in code with a `MIN_YEAR`/`MAX_YEAR` range of 2020–2050, but the page notes that the Government "may declare additional one-off public holidays." How are ad-hoc gazetted holidays (and their dates) intended to be incorporated, and what's the update process — code change + redeploy, or something more dynamic?
8. **Severance calculator's insurable earnings ceilings.** The compute file hard-codes year-specific ceilings (`ceilingFor(endYear)`). What's the process for keeping this in sync when NIS publishes new annual ceilings?
9. **Migration banner default URL.** `MigrationBanner` defaults to `https://www.gov.bb` when no `pageURL` is supplied, but the existing call sites all pass a `pageURL`. Is the default kept on purpose for a planned use case, or is it dead?
10. **Content scale.** There are several dozen service-content markdown files. Worth confirming the editorial workflow for updating these (PR-only? content team access? CMS roadmap?) — the spec is a good place to record that intent if it exists.
11. **Search index size.** The MiniSearch index is built in-memory on first search and lives in module scope. As content grows, is there a target ceiling, or a plan to move to a server-built index?

---

*Last drafted: 2026-05-26. Reviewers — please annotate or strike through anything that misrepresents intent, and answer the items in §13 so we can lock the spec in.*
