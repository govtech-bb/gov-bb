# Content: titles that match real queries, descriptions, and the home page description

## Problem

Search Console shows large demand landing on pages whose titles use different
words from the searcher, plus 31 missing, 16 over-long and 4 short
descriptions, 13 titles over 60 characters, and a home description that
promises services the site does not have.

## Impact

| Query (impressions, clicks, position)                                             | Page                                                        | Gap                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| barbados youth advance corps (259, 0, 9.2); byac barbados (91, 0)                 | `/work-employment/apply-to-the-barbados-youthadvance-corps` | title says "YouthADVANCE Corps" — one token vs two       |
| notary public barbados (484, 21, 2.8)                                             | `/travel-id-citizenship/get-a-document-notarised`           | "notary public" not in title or description              |
| welfare office barbados (1,369, 127); welfare department barbados number (132, 0) | `/money-financial-support/apply-financial-assistance`       | offices and phone not in the snippet                     |
| open pharmacy barbados; pharmacy queries (87, 2)                                  | `/health-and-emergency-services/find-an-open-pharmacy`      | title (71 chars) omits "open" and "Barbados"             |
| emergency shelters barbados hurricane                                             | `/health-and-emergency-services/find-an-emergency-shelter`  | "hurricane shelters" not in title; description 173 chars |
| barbados back to school assistance (112, 0, 11.2)                                 | textbook grant / financial assistance                       | no page or section uses those words                      |
| severance pay calculator barbados                                                 | `/money-financial-support/calculate-severance-pay`          | title lacks "calculator"; description 203 chars          |

The home description ("apply for passports, birth certificates, driver's
licences…") was repeated verbatim by an AI answer for "Barbados government
services online"; there are no passport or driving-licence pages.

## Where

- Frontmatter in `apps/landing/src/content/**` (`title`, `description`)
- `apps/landing/src/routes/index.tsx` (home description),
  `routes/services.tsx` ("Browse all digital government services…", 65 chars)
- `apps/landing/src/content/health-and-emergency-services/find-an-open-pharmacy/index.md` (pharmacy hub title/description),
  `apps/landing/src/routes/health-and-emergency-services/find-an-emergency-shelter/-meta.ts` (shelter title/description)

## Fix

Proposed copy for review (not applied):

| Page                     | Proposed title (≤ 60 chars before suffix)                  | Proposed description                                                                                                                      |
| ------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| YouthADVANCE Corps       | Apply to the Barbados Youth Advance Corps (BYAC)           | Join the Barbados Youth Advance Corps (BYAC): who can apply, what the programme offers and how to apply online.                           |
| Get a document notarised | Get a document notarised by a notary public                | Find a notary public in Barbados, what to bring and what it costs to have a document notarised.                                           |
| Financial assistance     | Apply for financial assistance from the Welfare Department | Apply online or at a Welfare Department office for help with food, bills, housing or essential needs. Office locations and phone numbers. |
| Pharmacy finder          | Find an open pharmacy in Barbados                          | Search pharmacies by parish and opening hours, and check which accept Barbados Drug Service prescriptions.                                |
| Shelter finder           | Find a hurricane or emergency shelter in Barbados          | Search the 70 emergency shelters by parish, category and accessibility, and read what to bring.                                           |
| Severance                | Severance pay calculator                                   | Estimate the severance payment you are owed under the Severance Payments Act by answering a few questions.                                |
| Home                     | (keep)                                                     | Official Government of Barbados services: birth, marriage and death certificates, financial assistance, licences, bank holidays and more. |

Then:

1. Add descriptions to `terms-conditions.md`, `whats-changing.md` and
   `apply-for-funeral-embalmer-licence/index.md`. The 13 `/start` files without
   one are noindexed and due for removal — skip them.
2. Trim the 16 descriptions over 160 characters (severance 203, marriage
   certificate 202, temporary restaurants 201, temporary restaurant permit
   188, pharmacy 181, Job Start 176, summer camp 175, shelter guidance 175,
   shelters 173, financial assistance 169, StormReady checklist 167, death
   certificate 166, birth certificate 166, register a birth 165, NHC land 164,
   StormReady 161).
3. Shorten the titles over 60 characters (community sports training 84, crop
   over permits 72, pharmacy hub 71, beach park 64, water outages 61).
4. Content hygiene from the crawl: 3 links with trailing slashes (post-office
   pages), h2 → h4 skips in `register-a-birth.md` and
   `get-a-primary-school-textbook-grant/index.md`, `terms-conditions.md`
   starting at h3, generic h2s ("Overview" ×18, "More information" ×18).
5. A "back to school" section (or page) if the textbook grant and welfare
   back-to-school support are distinct programmes.

## Acceptance criteria

- Every public page has a description of 70–160 characters and a title of
  ≤ 60 characters before the suffix.
- The seven proposed rewrites are reviewed by content owners and applied or
  amended.
- Home description names only services that exist.
- CTR on the seven pages compared 28 days before/after in Search Console.

Suggested labels: `enhancement`, `severity:minor`, `subsystem:landing`, `area:frontend`
