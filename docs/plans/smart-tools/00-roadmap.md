# Smart tools authoring roadmap

Status: stage 1 of 4 implemented; remaining stages have dependent PRs. Approved scope recorded 9 September 2026; implementation baseline `c86795ee`.

Staff will maintain registered Smart tools through the existing form builder, without editing code. Each tool keeps its own public interface, structure and behaviour. Pharmacies and shelters are locators; StormReady is a checklist; permits are a decision guide; the three calculators, holiday calendar and outage information have separate renderers.

The team taxonomy is **Content**, **Smart tools**, **Simple services**, and **Complex services**. This programme extends authoring for Smart tools. Static introductions retain the existing Content editor. It does not turn every service into a form or a common page template.

## Delivery and dependencies

| PR stage                         | Plans | Complete when                                                                                                                        |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Shared workflow and locators | 01–04 | Pharmacy and shelter edits use the same validated editing, draft, actual preview and publication workflow; all source data survives. |
| 2 — Checklist and permit guide   | 05–06 | Both distinct interfaces consume editable content with stable IDs and unchanged behaviour.                                           |
| 3 — Calculators                  | 07–09 | Text and named policy values are editable; formulas and explanations agree under draft policy.                                       |
| 4 — Calendar, feed and handover  | 10–12 | All nine groups and child views work, documentation is complete, and required checks pass.                                           |

Use dependent PRs while earlier stages await review. Merge remains the team's existing review/deployment process. Each stage can be reverted separately; content updates subsequently use the existing Git history and revert process.

## Non-negotiable behaviour

- Omission never deletes a record. Existing records, unknown fields and stable identities survive partial edits; removal is explicit and reviewable.
- Drafts retain their source revision. Stale or competing updates cannot overwrite current content.
- The server chooses a fixed registered JSON path. Author input cannot choose code or arbitrary repository paths.
- Preview renders the actual service with validated unsent content. Each tool can have different views and structures.
- Content publication creates or updates a PR; it does not imply merge, deployment, verification of policy, or release of a hidden service.
- Use existing authentication, dependencies and editor patterns. No CMS database, arbitrary page builder, new permissions system or formula language.

## Implementation plans

- [Shared content and publication contract](01-content-contract.md)
- [Shared authoring and actual public previews](02-editor-and-preview.md)
- [Pharmacy locator](03-pharmacies.md)
- [Emergency shelter locator](04-shelters.md)
- [StormReady checklist](05-stormready.md)
- [Crop Over decision guide](06-permits.md)
- [Severance calculator](07-severance.md)
- [Self-employed National Insurance calculator](08-national-insurance.md)
- [Government pension calculator](09-pension.md)
- [Bank holiday calendar](10-bank-holidays.md)
- [Water outage information](11-water-outages.md)
- [Coverage, rollout and handover](12-coverage-and-handover.md)

## Inventory

| Service group                               | Existing implementation and content                                                                                                                                                                          | Proposed staff editing                                                                                                                       | Behaviour that stays in code                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Open pharmacy                               | `routes/health-and-emergency-services/find-an-open-pharmacy/`; finder and pharmacy detail pages; 163 records in `-data/pharmacies.json`                                                                      | Names, addresses, contacts, PPP status, weekly and bank-holiday hours, notes, location, source/review information and page guidance          | Open-now calculations, distance, filtering and contact actions                                                        |
| Emergency shelters                          | `routes/health-and-emergency-services/find-an-emergency-shelter/`; landing, finder and guidance pages; 70 records in `-data/emergency-shelters.json`, plus contacts and guidance in `-data/guidance-data.ts` | Shelter records, accessibility, planning capacity, restrictions, district contacts, telephone directory, reference guidance and review dates | Filtering, distance and lists derived from shelter records; capacity remains a planning figure, not live availability |
| StormReady checklist                        | `content/health-and-emergency-services/stormready/checklist.tsx`; seven sections and 38 items in `-data/stormready-checklist.ts`                                                                             | Sections, items, hints, season label and review date                                                                                         | Saved progress, check-off behaviour and printing                                                                      |
| Crop Over permit helper                     | `routes/business-trade/crop-over-permits/`; ten permit definitions in `-lib/permits.ts`                                                                                                                      | Permit names, agencies, links, lead-time guidance, documents, contacts and explanatory copy                                                  | Question flow, condition matching and step numbering; existing conditions remain attached to the same permit          |
| Severance calculator                        | `routes/money-financial-support/calculate-severance-pay/`; UI copy and policy constants in `-lib/compute.ts`                                                                                                 | Guidance, labels, source links; validated year-specific ceiling records and explicitly identified policy parameters                          | Eligibility, date calculations and calculation algorithms                                                             |
| Self-employed National Insurance calculator | `routes/money-financial-support/national-insurance-for-self-employed-workers/`; UI copy and `NIS` policy object in `-lib/compute.ts`                                                                         | Guidance, labels, source links; validated contribution rates and limits with source/effective-period information                             | Contribution and benefit algorithms                                                                                   |
| Government pension calculator               | `routes/pensions-and-gratuities/calculate-your-pension/`; UI copy and constants in `-lib/compute.ts`                                                                                                         | Guidance, labels and source links; only explicitly identified policy parameters with defined validation                                      | Service calculations and pension/gratuity algorithms                                                                  |
| Bank holiday calendar                       | `routes/bank-holiday-calendar/`; dates computed in `lib/bank-holidays.ts`                                                                                                                                    | Page explanation, source links and review information                                                                                        | Statutory dates, Easter and substitution rules; generated dates are displayed read-only                               |
| Water outages                               | `routes/health-and-emergency-services/water-outages/`; outage feed comes through the API; includes subscription confirmation and unsubscribe pages                                                           | Headings, guidance, help/contact links and message copy                                                                                      | Live feed, map geometry, parish matching, subscription delivery and token handling                                    |

Shared site layouts, home/search, feedback, error pages and general platform flows remain outside this programme. New one-off holiday rules and bulk Word ingestion are separate features.
