# Landing (alpha.gov.bb) SEO audit — September 2026

**Date:** 2026-09-24 · **Scope:** `apps/landing` as served at `https://alpha.gov.bb`
(prod) · **Inputs:** Search Console exports (Performance, last 3 months to
2026-09-21; Pages indexing to 2026-09-20), a 247-URL crawl of the live site,
Lighthouse 13.5 lab runs (mobile + desktop, 5 pages), an agent-readiness scan,
web-index visibility checks for 17 queries, and a read of the head/sitemap/
structured-data code on `main` at `0b5a21c6`.

> Findings are grouped in the order search engines fail: crawlability and
> indexation, then technical foundations, on-page, content, AI search, and
> performance. Every actionable finding has an implementation-ready issue file
> under [`issues/`](issues/). Nothing in this round changes code.

## Executive summary

The site's SEO foundation is sound: full server-rendered HTML, canonicals and
Open Graph on the main page types, `GovernmentService`/`BreadcrumbList`
JSON-LD, an env-gated `robots.txt`, a dynamic sitemap, real HTTP 404s, HSTS.
Google rewards it: 5,464 clicks from 85,077 impressions in the last quarter,
steady at 350–470 clicks a week, 73 % on mobile, 82 % from Barbados.

The problems are in how consistently that layer is applied, and in what happens
to URLs when content is switched off:

1. **Ranking URLs go 404 when a service is feature-flagged.** The three
   certificate `/start` pages and the textbook-grant page earned 502 clicks
   and 5,900 impressions last quarter and all return 404 today. 11 % of all
   clicks and 13 % of impressions in the period landed on a non-200 response.
   ([issue 01](issues/01-flagged-services-return-404.md))
2. **The previous site's URLs still rank and 404.** 144 `/government/
organisations/*` URLs plus `/welfare-department` and the `www.` host still
   earn ~11,000 impressions a quarter; "ministry of education barbados"
   (765 impressions) lands on a 404. ([02](issues/02-legacy-urls-redirect-or-gone.md),
   [03](issues/03-www-host-and-non-prod-hosts.md))
3. **Bank holidays is the biggest page and the leakiest.** 20,630 impressions
   at position 3.5 but 3.45 % CTR; 30 `?year=` variants with no canonical are
   indexed separately (30 URLs, 5,357 impressions), and the year switcher
   walks crawlers through 2020–2050. ([04](issues/04-bank-holidays-year-urls-and-answers.md))
4. **Titles and descriptions are inconsistent.** 59 of 247 crawled pages have
   no `| Government of Barbados` suffix, so search engines pad them with the
   logo's alt text ("Register a birth - Go to alpha.gov.bb"); all 12 category
   hubs have no meta description. ([05](issues/05-head-hygiene-titles-descriptions-canonicals.md))
5. **Mobile performance is held back by one image.** The 1.14 MB coat of arms
   is 65 % of every page's transfer; Lighthouse mobile performance is 65–73
   on service and topic pages (desktop 89–99); HTML is served uncompressed.
   ([06](issues/06-coat-of-arms-og-image-favicons.md), [07](issues/07-html-served-uncompressed.md))

Quick wins (days, not weeks): the `pageHead` refactor (05), swapping the coat
of arms file (06), `lastmod` in the sitemap (08), and five title rewrites that
match what people actually type (09).

## Scorecard

| Area                  | State          | Key evidence                                                                                                                              |
| --------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Crawlability          | Good           | robots allow-all, sitemap advertised, SSR HTML, TTFB p50 0.37 s                                                                           |
| Indexation            | Weak           | 260 indexed vs 895 not indexed; 583 are 404s; 213 "discovered/crawled – not indexed"; 15 duplicates without canonical (validation failed) |
| URL hygiene           | Weak           | flagged services 404; `www.` duplicate host; 31-year `?year=` chain; 307 trailing-slash redirects                                         |
| Titles & descriptions | Mixed          | suffix missing on 59 pages; 31 pages with no description (all 12 hubs); 16 descriptions > 160 chars                                       |
| Structured data       | Good base      | Organization, WebSite, GovernmentService, BreadcrumbList, Pharmacy; missing dates, contact, channel; legal pages typed as services        |
| Internal linking      | Mixed          | footer links everywhere; `/services` A–Z omits feature pages; 42 pharmacy pages and `/tell-us`, `/whats-changing` have no inbound links   |
| Performance           | Weak on mobile | LCP 4.6–14.4 s mobile; 1.7 MB transfer/page; CLS 0.156 on two pages; uncompressed HTML                                                    |
| AI search readiness   | Fair           | 75/100 agent-readiness; bots allowed; no `llms.txt`; no about/contact/privacy pages; brand queries won by gov.bb                          |
| Off-site authority    | Weak           | gov.bb home and Wikipedia link only to www.gov.bb; branded queries ("gov.bb", "barbados government website") go to the legacy site        |

## 1. What Search Console says

### Performance (2026-06-22 → 2026-09-21, web search)

| Metric                       | Value                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Clicks / impressions / CTR   | 5,464 / 85,077 / 6.42 %                                                              |
| Weekly clicks (steady state) | 350–470; no downward trend (the first week's 14,401 impressions was a one-off spike) |
| Devices                      | Mobile 3,992 clicks (73 %, pos 4.6) · Desktop 1,384 (pos 8.4) · Tablet 88            |
| Countries                    | Barbados 82 % of clicks · US 349 · UK 298 · Canada 115 · Trinidad 33                 |
| Branded queries              | 23 queries, 72 clicks — traffic is almost entirely non-branded                       |
| Indexed pages                | 260 on 2026-09-20 (131 on 2026-06-29)                                                |

Top landing pages (clicks / impressions / CTR / position):

| Page                                                                           | Clicks |  Impr. |    CTR | Pos |
| ------------------------------------------------------------------------------ | -----: | -----: | -----: | --: |
| `/money-financial-support/apply-financial-assistance`                          |  1,115 | 10,444 | 10.7 % | 4.6 |
| `/family-birth-relationships/get-birth-certificate`                            |    768 |  4,653 | 16.5 % | 4.1 |
| `/bank-holiday-calendar`                                                       |    711 | 20,630 |  3.5 % | 3.5 |
| `/family-birth-relationships/get-marriage-certificate`                         |    301 |  2,572 | 11.7 % | 5.3 |
| `/money-financial-support/calculate-severance-pay`                             |    276 |  2,815 |  9.8 % | 4.4 |
| `/family-birth-relationships/get-birth-certificate/start` (**404 today**)      |    259 |  2,960 |  8.8 % | 4.2 |
| `/`                                                                            |    223 |  4,676 |  4.8 % | 8.6 |
| `/bank-holiday-calendar?year=2027`                                             |    176 |  3,084 |  5.7 % | 3.1 |
| `/money-financial-support/get-a-primary-school-textbook-grant` (**404 today**) |    156 |    815 | 19.1 % | 3.5 |
| `/business-trade/sell-goods-services-beach-park`                               |    121 |  1,215 | 10.0 % | 4.3 |

Demand by intent (from the 1,000 exported queries):

| Intent                                    | Queries | Clicks |  Impr. | Avg pos | Read                                                                                      |
| ----------------------------------------- | ------: | -----: | -----: | ------: | ----------------------------------------------------------------------------------------- |
| Bank holidays                             |     190 |    449 | 10,341 |     2.9 | Huge demand, low CTR: calendar sites win the snippet                                      |
| Welfare / financial assistance            |      40 |    517 |  3,547 |     4.6 | Strong; "welfare office", "department number" want contact details                        |
| Birth certificate                         |      47 |    247 |    859 |     3.8 | Strong, high CTR                                                                          |
| Marriage / death certificate              |      41 |     72 |    823 |    21.3 | Pages exist but rank poorly                                                               |
| Youth programmes (BYAC, Job Start, camps) |      32 |     29 |    850 |     8.8 | "barbados youth advance corps" 259 impr, 0 clicks — spelling mismatch with "YouthADVANCE" |
| Business licences / permits               |      20 |      5 |    553 |     8.0 | 14 licence pages, almost invisible                                                        |
| Pharmacy                                  |      14 |      2 |     87 |     6.3 | 164 pages, almost no demand captured                                                      |
| Shelters / water                          |       2 |      1 |     13 |       — | Seasonal pages not surfacing even in hurricane season                                     |

Zero- or near-zero-click queries with real volume: "ministry of education
barbados" (765 impr, 3 clicks — lands on a 404), "barbados licensing authority"
(334, 0), "barbados youth advance corps" (259, 0), "caipo barbados" (157, 0),
"barbados treasury" (141, 0), "welfare department barbados number" (132, 0),
"barbados back to school assistance" (112, 0), "is today a bank holiday in
barbados" (197, 4), "emancipation day barbados 2026" (429, 9).

### Indexing (Pages report, 2026-09-20)

| Reason                                    |     Pages | Note                                                                                         |
| ----------------------------------------- | --------: | -------------------------------------------------------------------------------------------- |
| Not found (404)                           |       583 | Old-site URLs plus flagged services                                                          |
| Discovered – currently not indexed        |       126 | Likely thin pharmacy pages; needs the per-reason export                                      |
| Crawled – currently not indexed           |        87 | Same                                                                                         |
| Alternate page with proper canonical      |        34 | `www.`, `?year=`, uppercase variants — working as designed                                   |
| Excluded by noindex                       |        16 | search results, gated pages                                                                  |
| Duplicate without user-selected canonical |        15 | **Validation failed** — pages with no canonical (bank holidays `?year=`, shelters, feedback) |
| Soft 404                                  |        15 | Empty category/subcategory hubs ("No services yet.") and old pages                           |
| Page with redirect                        |        15 | bare-slug 301s                                                                               |
| Indexed, though blocked by robots.txt     |        10 | most likely `forms.alpha.gov.bb/forms/*` (702 impressions on one form URL)                   |
| Blocked by robots.txt / 5xx / 401         | 2 / 1 / 1 | —                                                                                            |

### Where clicks land today

Live-checking the 42 URLs that carry 94 % of impressions: **546 clicks (11 %)
and 10,614 impressions (13 %) went to URLs that are not 200 now.**

| Bucket                                                         | URLs | Clicks | Impr. | Status now                |
| -------------------------------------------------------------- | ---: | -----: | ----: | ------------------------- |
| Certificate `/start` pages                                     |    3 |    346 | 5,082 | 404 (form flagged off)    |
| `/money-financial-support/get-a-primary-school-textbook-grant` |    1 |    156 |   815 | 404 (service flagged off) |
| `/welfare-department` (old site)                               |    1 |     24 |   770 | 404                       |
| Old `/government/organisations/*` (all 144 in the export)      |  144 |     93 | 8,083 | 404                       |
| `www.alpha.gov.bb/*` (all 67 in the export)                    |   67 |     38 | 2,509 | 200 duplicate or 404      |
| Root-level slugs (old pages + bare slugs)                      |   48 |    252 | 4,326 | 301 or 404                |

## 2. Technical SEO

| #   | Issue                                                                                    | Impact | Evidence                                                                                      | Fix                                                                                                                                   | Priority                                                       |
| --- | ---------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| T1  | Flagging a service off turns its URLs into 404s                                          | High   | Table above; ADR 0063 maps `disabled` → 404 + drop from sitemap                               | Adopt GOV.UK unpublishing semantics: paused → 200 + notice, retired → 410 + explanation, replaced → 301; 404 only for never-published | [01](issues/01-flagged-services-return-404.md)                 |
| T2  | Old-site URLs 404 while still ranking                                                    | High   | 144 `/government/organisations/*` URLs, 8,083 impr; 583 404s in GSC                           | Redirect map for high-value old URLs, 410 with explanation for the rest; relaunch org pages at the same paths                         | [02](issues/02-legacy-urls-redirect-or-gone.md)                |
| T3  | `www.alpha.gov.bb` serves the full site (200)                                            | Med    | 67 www URLs in GSC; 15 "duplicate without canonical" failed validation                        | 301 www → apex in Amplify domain settings                                                                                             | [03](issues/03-www-host-and-non-prod-hosts.md)                 |
| T4  | Non-prod hosts rely on robots `Disallow` only                                            | Low    | staging/sandbox: no `X-Robots-Tag`, no auth; canonical points to prod                         | `X-Robots-Tag: noindex` on non-prod apps                                                                                              | [03](issues/03-www-host-and-non-prod-hosts.md)                 |
| T5  | `?year=` bank-holiday variants: no canonical, 31-year chain                              | Med    | 30 URLs, 5,357 impr; `?year=2046` and `?year=2020` indexed; `MIN_YEAR` 2020 / `MAX_YEAR` 2050 | Self-canonical + year titles inside a small window, canonical to base outside it                                                      | [04](issues/04-bank-holidays-year-urls-and-answers.md)         |
| T6  | Canonical missing on 9 live routes                                                       | Med    | bank holidays, shelters ×3, feedback, tell-us, crop-over `/form`; utility pages indexable     | `pageHead(..., { path })`; `noindex` on utilities                                                                                     | [05](issues/05-head-hygiene-titles-descriptions-canonicals.md) |
| T7  | Sitemap has no `lastmod`; lists empty subcategory hubs; lists 42 unlinked pharmacy pages | Med    | 223 URLs, 172 under health; GSC soft-404 ×15                                                  | `lastmod` from `publish_date`; skip empty hubs; gate unconfirmed pharmacies                                                           | [08](issues/08-sitemap-lastmod-empty-hubs-pharmacies.md)       |
| T8  | HTML and sitemap served uncompressed                                                     | Med    | 27.6 KB HTML, 32.9 KB sitemap, no `content-encoding`; Lighthouse "document latency 18 KiB"    | Enable compression for compute responses                                                                                              | [07](issues/07-html-served-uncompressed.md)                    |
| T9  | Trailing-slash redirects are 307                                                         | Low    | `/services/` → 307; not configurable in router-core                                           | Amplify redirect rule if wanted; canonicals already resolve it                                                                        | note only                                                      |
| T10 | Bare-slug redirect misses flagged pages                                                  | Low    | `/get-a-primary-school-textbook-grant` 404 (39 clicks) while page is flagged                  | Falls out of 01                                                                                                                       | [01](issues/01-flagged-services-return-404.md)                 |

Working as it should: SSR HTML for every page, `<html lang="en">`, HTTPS +
HSTS preload, http → https 301, real 404 status, uppercase paths canonicalised,
`/search-results` noindexed, bare slugs 301, staging/sandbox `Disallow: /`,
no broken internal links in the crawl, TTFB p50 0.37 s / p90 0.42 s.

## 3. On-page

| #   | Issue                                                                                       | Impact | Evidence                                                                                                                                                                                           | Fix                                                                                                                                    | Priority                                                                                                       |
| --- | ------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| O1  | Title template inconsistent                                                                 | Med    | 59/247 pages without the suffix; search engines rewrite them as "… - Go to alpha.gov.bb" (logo alt text)                                                                                           | Route `$.tsx` through `pageHead()`                                                                                                     | [05](issues/05-head-hygiene-titles-descriptions-canonicals.md)                                                 |
| O2  | No meta description on hubs                                                                 | Med    | all 12 category hubs + 5 subcategory hubs; hubs are 37–47 words                                                                                                                                    | Pass the taxonomy description; richer hub intro                                                                                        | [05](issues/05-head-hygiene-titles-descriptions-canonicals.md), [12](issues/12-internal-linking-and-hubs.md)   |
| O3  | Titles don't match the words people use                                                     | Med    | "YouthADVANCE" vs "youth advance corps" (259 impr, 0 clicks); "Get a document notarised" vs "notary public barbados" (484 impr); pharmacy hub title omits "open"; shelters vs "hurricane shelters" | Five targeted rewrites                                                                                                                 | [09](issues/09-content-titles-descriptions-and-copy.md)                                                        |
| O4  | Description lengths                                                                         | Low    | 16 over 160 chars (up to 203), 4 under 70, 31 missing                                                                                                                                              | Trim/add per list                                                                                                                      | [09](issues/09-content-titles-descriptions-and-copy.md)                                                        |
| O5  | `/start` pages are indexable duplicates of their parents and 404 when a form is flagged off | Med    | 14 `/start` URLs, 6,762 impr, 454 clicks                                                                                                                                                           | Team decision pending — A: `noindex` + redirect hidden ones to the parent (proposed); B: keep indexable, 200 + banner when flagged off | [05](issues/05-head-hygiene-titles-descriptions-canonicals.md), [01](issues/01-flagged-services-return-404.md) |
| O6  | Heading hierarchy                                                                           | Low    | every hub h1 → h3 ("Was this helpful?" follows the h1 directly); `register-a-birth` h2 → h4 twice; `/tell-us` has no h1 and no text                                                                | h2 sections on hubs; content fixes; noindex `/tell-us`                                                                                 | [12](issues/12-internal-linking-and-hubs.md), [09](issues/09-content-titles-descriptions-and-copy.md)          |
| O7  | 404 page carries the homepage title                                                         | Low    | 12 crawled URLs share "Government Services \| Government of Barbados"                                                                                                                              | Root `head({ match })` on `globalNotFound`                                                                                             | [05](issues/05-head-hygiene-titles-descriptions-canonicals.md)                                                 |

## 4. Content

- **Home description is inaccurate and gets quoted.** "apply for passports,
  birth certificates, driver's licences…" — no passport or driving-licence
  pages exist; an AI answer for "Barbados government services online" repeated
  it verbatim. ([09](issues/09-content-titles-descriptions-and-copy.md))
- **Contact intent is unmet.** "welfare office barbados" (1,369 impr), "welfare
  department barbados number" (132), "welfare department barbados" (501): the
  financial-assistance page ranks but the snippet doesn't show offices or
  phone numbers. A structured contact block (and `contactPoint` in JSON-LD)
  serves both users and AI answers. ([09](issues/09-content-titles-descriptions-and-copy.md), [11](issues/11-structured-data-v2-and-llms-txt.md))
- **Bank-holiday questions are answerable in one line.** "is today a bank
  holiday in barbados" (197), "is tomorrow a holiday" (83), "emancipation day
  barbados 2026" (429), "barbados bank holidays 2027" (233 + 119 + 116): an
  answer-first line ("The next bank holiday is …") and a dated line per holiday
  give both the featured snippet and AI answers something to extract.
  ([04](issues/04-bank-holidays-year-urls-and-answers.md))
- **Trust pages are missing.** No about, contact, privacy or accessibility
  statement; `/terms-conditions` carries the only privacy text (433 impr,
  0.23 % CTR). The agent-readiness scan fails "trust anchor pages" for this
  reason. ([13](issues/13-trust-pages-about-contact-privacy-accessibility.md))
- **Thin, unlinked pharmacy pages.** 42 of 164 pharmacy pages have no inbound
  link (`pppStatus: unconfirmed`, no opening hours) and ~200 words; pharmacy
  queries earned 2 clicks. Gate them until confirmed, and list the rest.
  ([08](issues/08-sitemap-lastmod-empty-hubs-pharmacies.md))
- **Old-site pages that people still want**: ministries, departments and
  agencies (ministry of education, licensing authority, treasury, CAIPO, QEH,
  airport). The organisation pages exist on a branch; relaunching them at the
  same URL pattern recovers ~8,000 impressions a quarter. ([02](issues/02-legacy-urls-redirect-or-gone.md))

## 5. AI search (GEO)

**Bot access:** `robots.txt` allows every agent, so GPTBot, ClaudeBot,
PerplexityBot and Google-Extended can all crawl. Keep it that way; no per-bot
stanzas are needed.

**Visibility (web index used by Brave/Claude, US locale, 2026-09-24):**

| Query                                           | alpha.gov.bb          | Who else                                          |
| ----------------------------------------------- | --------------------- | ------------------------------------------------- |
| how to get a birth certificate in Barbados      | #1 (bare slug) and #2 | gisbarbados, lawcourts, gov.bb `/register-birth`  |
| register a birth in Barbados                    | #2, #3                | lawcourts #1, gov.bb ×2                           |
| apply for financial assistance welfare Barbados | #1                    | Facebook, NIS, BRA, gov.bb `/Departments/welfare` |
| Barbados government services online             | #1                    | GIS, forms.gov.bb, BRA                            |
| Barbados bank holidays 2026                     | #4                    | totallybarbados, calendarific, holidayapi         |
| severance pay calculator Barbados               | #9                    | rivermate, papayaglobal, NIS                      |
| food business licence Barbados                  | absent                | BCCI, BIDC, agriculture.gov.bb                    |
| open pharmacy Barbados today                    | absent                | barbados.org, drugservice.gov.bb, gov.bb          |
| emergency shelters Barbados hurricane           | absent                | dem.gov.bb, GIS                                   |
| conductor licence Barbados                      | absent                | bla.gov.bb, BRA                                   |
| day nursery application Barbados                | absent                | childcareboard.gov.bb                             |

Domain-restricted searches return mostly stale old-site URLs ("Page not found
| The Government Of Barbados", `/government/organisations/*`, `www.`), so the
index still carries the previous site's footprint.

**Extractability:** service pages already use answer-first GOV.UK sections
(Who is this for, Before you start, Cost, What happens after, Contact) and a
visible "Last updated on" line — good. Gaps: hubs have no prose; generic h2s
("Overview", "More information"); no dated `dateModified` in markup.

**Authority signals to add:** `GovernmentOrganization` with description,
`contactPoint`, `address` and `sameAs`; `WebPage.dateModified` matching the
visible date; `GovernmentService.availableChannel` pointing at the start URL.
([11](issues/11-structured-data-v2-and-llms-txt.md))

**Presence:** the biggest lever is off-site. gov.bb's home page has zero links
to alpha.gov.bb; Wikipedia's "Government of Barbados" and "Barbados" articles
link to www.gov.bb only; branded queries ("gov.bb" 520 impr, "barbados
government website" 238, "barbados government" 192) resolve to the legacy site.
([15](issues/15-off-site-authority-and-monitoring.md))

**Machine-readable:** add `/llms.txt` with a when-to-use section (cheap, from
the same registry data as the sitemap). Skip `llms-full.txt`, Markdown content
negotiation and OKF: no evidence they matter for a service directory.
Agent-readiness score today: 75/100 (`is-agentic`).

## 6. Performance and Core Web Vitals (lab, Lighthouse 13.5)

| Page                                              | Perf mobile / desktop | LCP mobile |   FCP |   CLS | Transfer |
| ------------------------------------------------- | --------------------: | ---------: | ----: | ----: | -------: |
| `/`                                               |               73 / 89 |      4.8 s | 4.2 s | 0.001 | 1,709 KB |
| `/business-trade`                                 |               65 / 99 |     10.2 s | 4.0 s |     0 | 1,708 KB |
| `/business-trade/apply-for-food-business-licence` |               67 / 90 |      4.6 s | 4.2 s | 0.156 | 1,712 KB |
| `/…/find-an-open-pharmacy/worthing-pharmacy`      |               66 / 95 |     14.4 s | 3.9 s |     0 | 1,697 KB |
| `/bank-holiday-calendar`                          |               91 / 90 |      2.2 s | 1.7 s | 0.156 | 1,707 KB |

SEO 92–100, accessibility 98–100, best practices 100 on every page.

Causes, in order of size:

1. `public/images/coat-of-arms.png`: 1,120 KB of the ~1,700 KB per page, 1920×2064,
   rendered at 24 px (banner) and 112 px (footer), no width/height. Lighthouse:
   "image delivery, 1,116 KiB savings", "unsized images". ([06](issues/06-coat-of-arms-og-image-favicons.md))
2. Entry chunk 401 KB compressed / 2.28 MB raw: every page's compiled markdown
   (including preview/draft) ships eagerly; ~670 KB raw is unused hast
   `position` data. ([14](issues/14-bundle-fonts-and-cls.md))
3. HTML uncompressed (27.6 KB → ~7 KB). ([07](issues/07-html-served-uncompressed.md))
4. CLS 0.156 on two pages: the h1 + "Last updated" block shifts; consistent
   with font swap changing line breaks (Figtree, `font-display: swap`, no
   preload). ([14](issues/14-bundle-fonts-and-cls.md))
5. Render-blocking CSS ≈ 300 ms; ~23 `modulepreload` links per page.

Field data: Search Console's Core Web Vitals report was not in the exports;
CrUX likely has too little traffic per URL. Re-check after the fixes.

## 7. Prioritised action plan

**Critical (indexation is being lost)**

1. Stop flagged services from returning 404 — [01](issues/01-flagged-services-return-404.md)
2. Redirect or 410 the old-site URLs; relaunch organisation pages at the same paths — [02](issues/02-legacy-urls-redirect-or-gone.md)
3. 301 `www.` → apex; `X-Robots-Tag` on non-prod — [03](issues/03-www-host-and-non-prod-hosts.md)

**High impact** 4. Bank holidays: year canonicals + answer-first lines — [04](issues/04-bank-holidays-year-urls-and-answers.md) 5. Head hygiene via `pageHead` everywhere — [05](issues/05-head-hygiene-titles-descriptions-canonicals.md) 6. Coat of arms, og-image, favicons — [06](issues/06-coat-of-arms-og-image-favicons.md) 7. Compress HTML — [07](issues/07-html-served-uncompressed.md)

**Quick wins** 8. Sitemap `lastmod`, empty hubs, pharmacy gating — [08](issues/08-sitemap-lastmod-empty-hubs-pharmacies.md) 9. Five title rewrites, home description, length fixes — [09](issues/09-content-titles-descriptions-and-copy.md) 10. Decide `/start` policy (Option A noindex + redirect, or Option B indexable + never 404) — [05](issues/05-head-hygiene-titles-descriptions-canonicals.md), then 01

**Longer term** 11. Structured data v2 + `llms.txt` — [11](issues/11-structured-data-v2-and-llms-txt.md) 12. Internal linking and hub content — [12](issues/12-internal-linking-and-hubs.md) 13. Trust pages — [13](issues/13-trust-pages-about-contact-privacy-accessibility.md) 14. Bundle, fonts, CLS — [14](issues/14-bundle-fonts-and-cls.md) 15. Off-site authority and monthly monitoring — [15](issues/15-off-site-authority-and-monitoring.md) 16. Regression guards (head tests, content lint, Lighthouse on previews) — [10](issues/10-seo-regression-guards.md)

## Appendix A — Data still worth pulling from Search Console

Per-reason URL lists (Pages report → reason → Export): Not found (404) [583],
Discovered – currently not indexed [126], Crawled – currently not indexed [87],
Duplicate without user-selected canonical [15], Soft 404 [15], Indexed though
blocked by robots.txt [10]. These decide the redirect map in 02 and confirm
which pages are being skipped in 08. Also: Links → top linking sites, and the
Core Web Vitals report if it has data.

## Appendix B — Method

- Crawl: sitemap URLs + hub links + one discovery pass, 247 URLs, recording
  status, title, description, canonical, robots, headings, word count, JSON-LD
  types, links and images. Summary: 236 × 200, 11 × 404 (gated categories,
  seeded subcategory slugs, one flagged `/start`); no broken internal links.
- Lighthouse 13.5 via Playwright's Chromium, default mobile throttling and the
  desktop preset; PageSpeed Insights' keyless quota was exhausted.
- Visibility: 17 queries against the web index behind Brave/Claude search (US
  locale). Google AI Overviews, ChatGPT and Perplexity were not sampled;
  see 15 for the monthly routine.
- Search Console: Performance (Queries, Pages, Countries, Devices, Chart) and
  Pages-indexing summary exports dated 2026-09-24. The query export is capped
  at 1,000 rows (1,657 of 5,464 clicks); the rest is long tail.
- Code read: `apps/landing/src/lib/{page-head,sitemap,robots,structured-data}.ts`,
  `routes/{__root,$}.tsx`, `routes/{robots,sitemap}[.]{txt,xml}.ts`,
  `vite.config.ts`, `amplify.yml`, `lib/service-status.ts`, ADR 0013/0063.
