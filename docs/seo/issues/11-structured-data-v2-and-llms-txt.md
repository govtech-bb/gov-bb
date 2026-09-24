# Structured data v2 and `llms.txt`

## Problem

The JSON-LD layer is a good base (Organization, WebSite, GovernmentService,
BreadcrumbList, Pharmacy) but is missing what search engines and AI answers
use to trust and date a government source:

- `Organization` is not `GovernmentOrganization`; no `description`,
  `contactPoint`, `address` or `sameAs` (the agent-readiness scan flags all
  four).
- No `dateModified` anywhere, although every content page shows "Last updated
  on …".
- `GovernmentService` has no `category` or `availableChannel`; it is emitted
  for `/terms-conditions`, `/whats-changing` and `/what-we-mean-by-alpha`,
  which are not services, and twice for services with a `/start` page.
- `WebSite.potentialAction` (sitelinks search box) points at a noindex page and
  the feature was retired by Google in 2024.
- `Pharmacy` has no `openingHoursSpecification` although hours are in the data.
- No `/llms.txt`.

## Where

- `apps/landing/src/lib/structured-data.ts` (`buildOrganizationLd`,
  `buildWebSiteLd`, `buildGovernmentServiceLd`, `buildBreadcrumbLd`)
- `apps/landing/src/routes/$.tsx` public-page branch (scripts)
- `apps/landing/src/routes/__root.tsx` (site-wide scripts)
- `apps/landing/src/routes/health-and-emergency-services/find-an-open-pharmacy/-lib/json-ld.ts`
- new `apps/landing/src/lib/llms.ts`, `apps/landing/src/routes/llms[.]txt.ts`

## Fix

1. `buildOrganizationLd`: `'@type': 'GovernmentOrganization'` (keep the
   `@id`), add `description`, `contactPoint` (general enquiries phone/email,
   `contactType: 'customer service'`), `address` (PostalAddress) and `sameAs`
   once the official profile URLs are supplied.
2. `buildWebSiteLd`: add `'@id': `${SITE_URL}/#website``; remove
`potentialAction`.
3. New `buildWebPageLd(page)`: `url`, `name`, `description`, `dateModified`
   from `publish_date` (YYYY-MM-DD, the same value the template shows),
   `isPartOf: { '@id': '<site>/#website' }`. Emit as the third script on
   public pages.
4. `buildGovernmentServiceLd`: add `category: getCategoryTitle(categories[0])`;
   optional `availableChannel: { '@type': 'ServiceChannel', serviceUrl }` when
   the `/start` page is visible; emit only when the page has a category (so
   legal/about pages stop being services) and only on the entry page, not on
   `/start`.
5. Pharmacy: `openingHoursSpecification` from the hours object.
6. `/llms.txt`: server route mirroring `robots[.]txt.ts`, content from
   `lib/llms.ts` — a header, a "when to use this site" paragraph (official
   Government of Barbados services and guidance; not the legacy gov.bb site),
   then per visible category `## title`, description, and `- [title](url):
description` for its public services (`categoryServices`). Skip
   `llms-full.txt`, Markdown content negotiation and OKF.
7. Validate with Rich Results Test and validator.schema.org on a service page,
   a pharmacy page and the home page.

## Acceptance criteria

- `lib/structured-data.test.ts`: GovernmentOrganization type; WebPage
  `dateModified` format and omission without a date; GovernmentService
  `category`, channel present only with a visible start page, absent on
  uncategorised pages; no `potentialAction`.
- `lib/llms.test.ts`: contains a category heading and a known public page,
  excludes preview pages, honours the status overlay.
- Rich Results Test shows no errors; the agent-readiness scan's Organization
  checks pass.

Suggested labels: `enhancement`, `severity:minor`, `area:frontend`, `subsystem:landing`
