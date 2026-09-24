# `www.alpha.gov.bb` serves a full duplicate of the site; non-prod hosts have no noindex header

## Problem

`https://www.alpha.gov.bb/…` returns 200 for every page instead of redirecting
to the apex. Canonicals point at the apex, so Google mostly consolidates, but
67 `www.` URLs appear in Search Console (2,509 impressions), 34 pages are
"Alternate page with proper canonical", and 15 are "Duplicate without
user-selected canonical" with validation **failed**.

Staging (`staging.alpha.gov.bb`), sandbox (`landing.sandbox.alpha.gov.bb`) and
PR previews rely on a build-time `robots.txt` `Disallow: /` and a canonical
that points at prod. There is no `X-Robots-Tag`, no auth, and the prod default
domain `prod.d33h8dmrfcznn0.amplifyapp.com` serves the site with
`Allow: /`.

## Impact

Duplicate-host signals dilute the apex; the failed duplicate validation keeps
resurfacing in Search Console; a non-prod host can be indexed if it is ever
linked (robots `Disallow` prevents crawling but not indexing of the URL).

## Where

- Amplify Console → landing prod app → Domain management (no repo config).
- `amplify.yml` `customHeaders` (shared by all apps; cannot vary per
  environment) — per-app custom headers live in each app's Console.
- `apps/landing/src/routes/robots[.]txt.ts` (build-time `VITE_ALLOW_INDEXING`).

## Fix

1. Amplify domain management: configure `www.alpha.gov.bb` as a **redirect**
   to `alpha.gov.bb` (301), not as a second alias serving the app.
2. Add `X-Robots-Tag: noindex, nofollow` as a custom header on the sandbox and
   staging Amplify apps (Console-level custom headers, pattern `**/*`), and on
   the prod app's default `*.amplifyapp.com` domain if Amplify allows
   host-scoped headers; otherwise leave the canonical to handle it.
3. Document `VITE_ALLOW_INDEXING` and `VITE_SITE_URL` per environment in
   `apps/landing/.env.example` and `README.md` (they are set only in the
   Console today).
4. After 1: in Search Console, re-run validation on "Duplicate without
   user-selected canonical".

## Acceptance criteria

- `curl -sI https://www.alpha.gov.bb/services` returns 301 to
  `https://alpha.gov.bb/services`.
- `curl -sI https://staging.alpha.gov.bb/` includes `x-robots-tag: noindex`.
- Search Console duplicate-canonical validation passes on the next cycle.

Suggested labels: `enhancement`, `severity:important`, `area:infra`, `subsystem:landing`
