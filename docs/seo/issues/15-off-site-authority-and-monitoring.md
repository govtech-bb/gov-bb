# Off-site authority, brand queries, and a monthly visibility routine

## Problem

Branded and navigational queries go to the legacy site: "gov.bb" (520
impressions, 6 clicks, position 7.8), "barbados government website" (238, 7),
"barbados government" (192, 2), "government of barbados" (92, 1). The legacy
`gov.bb` home page has zero links to `alpha.gov.bb`; Wikipedia's "Government
of Barbados" and "Barbados" articles link only to `www.gov.bb`. In AI-search
checks, alpha.gov.bb ranks first for birth certificates, financial assistance
and "government services online", but is absent for food business licences,
open pharmacies, emergency shelters, conductor licences and day nurseries,
where other `.gov.bb` domains (BLA, DEM, Child Care Board, agriculture) or
directories are cited instead.

## Impact

Authority (links from gov.bb, GIS, ministries) is the ranking factor this
domain lacks most; without it, well-built pages sit at positions 5–10 behind
older government subdomains.

## Fix (owners outside this repo)

1. `gov.bb` and `gisbarbados.gov.bb`: link to the alpha service pages from the
   matching department/service pages ("Apply online at alpha.gov.bb"), and
   from the gov.bb home page's services area.
2. Ministry and agency sites that own a service (BLA, DEM, Child Care Board,
   NIS, Welfare Department, Registration Department): link their "apply" or
   "how to" pages to the alpha equivalent.
3. Wikipedia: add alpha.gov.bb as the official services portal in the
   "Government of Barbados" external links (neutral, factual edit).
4. Bing Webmaster Tools: import the property from Search Console (one click)
   so Copilot/Bing coverage and IndexNow are available.
5. Monthly routine (30 minutes): run the 15 tracked queries in Google (AI
   Overviews), ChatGPT and Perplexity three times each, log cited / not cited
   and who was cited instead; review Search Console Pages report reasons and
   the CTR of the ten pages in issue 09; re-run Lighthouse on the five sampled
   pages.

Tracked queries: how to get a birth certificate in Barbados · register a
birth in Barbados · apply for financial assistance welfare Barbados · Barbados
bank holidays 2026 / 2027 · is today a bank holiday in Barbados · severance
pay calculator Barbados · food business licence Barbados · open pharmacy
Barbados · emergency shelters Barbados hurricane · conductor licence Barbados ·
day nursery application Barbados · notary public Barbados · Barbados youth
advance corps · Barbados government website.

## Acceptance criteria

- At least the gov.bb home page and three department pages link to alpha
  service pages (Search Console Links → top linking sites shows gov.bb).
- Bing Webmaster property verified.
- A shared sheet with the monthly visibility log, first row dated the month
  after these fixes ship.

Suggested labels: `enhancement`, `severity:minor`, `subsystem:landing`
