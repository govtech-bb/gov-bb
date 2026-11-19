# 0140. Interactive tools keep their code in landing and read their data from api_v2

**Date:** 2026-11-19
**Status:** Accepted
**Related:** [#3204](https://github.com/govtech-bb/gov-bb/issues/3204) (this
decision), [#3155](https://github.com/govtech-bb/gov-bb/issues/3155) (the
epic), [ADR 0129](./0129-deployed-content-databases-are-loaded-once-then-written-only-by-the-editor.md),
[ADR 0138](./0138-landing-tools-send-shared-fixed-name-events.md) (the tools'
analytics events)

## Context

`apps/landing` has interactive tools: a calendar, two finders, three
calculators, a rules-based tool, a live map and a checklist. Their records,
rates, rules data and page text are in landing's source, so a changed phone
number, opening time or rate needs a developer and a deploy. The calendar is
the exception: it calculates the statutory holidays, and the one-off holidays
the Government declares are not in landing at all
(`apps/landing/src/lib/bank-holidays.ts`). Epic #3155 moves
that data to the api_v2 database, so editors change it in editor_v2.

The tools are not all the same kind. Some list records. Some calculate an
answer from rates and rules, with tested code. One shows a live feed that
another system owns. #3155 needs one rule that says, for each kind, what
moves to the database and what stays in landing.

The tool data also doesn't fit api_v2's data collections today. A collection
field can only be `text`, `slug` or `email`, and every stored value is a
string (`FIELD_TYPES` and `RecordData` in
`apps/api_v2/src/modules/collection.ts`). The shelters need numbers and yes/no
values, and the pharmacies have coordinates and opening hours. Only a developer
can add a collection, in `apps/api_v2/src/seed-data/collections.ts` (#3681). A
deployed environment gets those collections only with its one-time estate
import (ADR 0129), so a collection added after that import never reaches it
once editors have written (#3783).

## Decision

**The data moves to api_v2. The code that filters, measures or calculates
stays in landing.** What moves depends on the kind of tool:

| Kind        | Tool                                  | What moves to api_v2                                                                 | What stays in landing                                                          |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| List        | Bank holiday calendar (#3205)         | Only the one-off holidays the Government declares, as a `public-holidays` collection | The statutory holidays and substitution rules of Cap. 352, calculated as today |
| List        | Find an open pharmacy (#3206)         | The pharmacy records                                                                 | Filtering, distance and opening-hours logic                                    |
| List        | Find an emergency shelter (#3207)     | The shelter records                                                                  | Filtering and distance logic                                                   |
| Calculator  | Severance pay (#3210)                 | Rates, rules data and page text                                                      | The tested `compute.ts`                                                        |
| Calculator  | Pension (#3210)                       | Rates, rules data and page text                                                      | The tested `compute.ts`                                                        |
| Calculator  | NIS for self-employed workers (#3210) | Rates, rules data and page text                                                      | The tested `compute.ts`                                                        |
| Rules-based | Crop Over permits (#3209)             | The permit details and page text                                                     | The tested `compute.ts`                                                        |
| Live feed   | Water outages (#3208)                 | Page text only                                                                       | The feed, on api v1 at `GET /water-alerts/outages`                             |
| Undecided   | StormReady checklist (#3239)          | Nothing yet                                                                          | The self-rendered page                                                         |

- **List tools** read their records from an api_v2 data collection. The
  filters, the distance and the opening-hours logic stay in landing.
- **Calculators and rules-based tools** keep their `compute.ts` in landing,
  with its tests. Today their rates and rules data are constants in code, for
  example `INSURABLE_CEILINGS` in severance pay's `compute.ts`, `NIS` in NIS
  for self-employed workers' `compute.ts`, and `PERMITS` in Crop Over
  permits' `permits.ts`. These become inputs: landing reads them from api_v2
  and passes them to `compute.ts`.
- **Live-feed tools** keep the feed where it is. Only their page text moves.
- **The StormReady checklist** stays out of api_v2 page records until #3239
  decides what it is. It is a self-rendered page
  (`apps/landing/src/content/health-and-emergency-services/stormready/checklist.tsx`),
  and `apps/landing/src/routes/$.tsx` prefers an api_v2 page to a
  self-rendered one (`v2Page ?? findPage(splat)`). An api_v2 row at its URL
  would replace the checklist with the row's body, which is empty for a
  feature-route record.

**Collections get the field types `number`, `boolean`, `date` and `list`
(#3782, decided 19 Nov 2026).** Nested data is flattened into fields that an
editor can edit:

- a coordinate becomes two `number` fields, `lat` and `lon`;
- opening hours become one `text` field per day, such as
  `mon` = `08:15-12:00, 13:00-16:30`, which landing parses and checks;
- a permit's in-person contact (`applyInPerson` in Crop Over's `permits.ts`)
  becomes its own `text` fields: address, phone, email and note.

There is no general `json` field type.

**Records reach a deployed environment through a one-time records import
(#3783, decided 19 Nov 2026).** A script builds a committed snapshot of each
tool collection from landing's data, as `build-seed-data.ts` builds
`estate.json`. The import writes the snapshot into an environment once, and
running it again with no changes writes nothing. After that, editors own the
records, as ADR 0129 says for pages.

**Admins and approvers can create collections in editor_v2 (#3681, decided
19 Nov 2026).** A new tool collection doesn't need a developer.

**Feature-route pages get api_v2 page records with an empty body.** The bank
holiday calendar, Find an emergency shelter and water outages are routes with
a `-meta.ts`, not `.md` pages. `apps/api_v2/scripts/build-seed-data.ts` reads
each `-meta.ts` and adds a page to `estate.json` with its title, description,
category, keywords and visibility, and an empty body
(`featureRoutePage` in `apps/api_v2/src/seed-data/feature-route-pages.ts`,
#3716 for #3256). The record puts the page in category listings, search and the
sitemap. Landing never renders it: each page's own route takes precedence over
the `$` catch-all. The body is empty because the public chat assistant ingests
the body of every `/catalog` page (`apps/chat/src/ingest/api-v2-source.ts`), so
any text there would become a source that chat cites. Find an open pharmacy,
the calculators and Crop Over permits already have an `index.md`, so they are
already in `estate.json`.

**Until the cutover, each tool falls back to its data in code.** Until an
environment's landing cutover (#3164) and its records import, a tool uses the
data it has in code today when its collection is missing or the api_v2 read
fails. The citizen sees no error. For the calendar, the fallback is the
calculated statutory holidays alone. `fetchCollectionRecords` in
`apps/landing/src/lib/api-v2-collections.ts` already returns `null` for a
missing collection or a failed read.

## Alternatives considered

- **Move the calculation code into the database.** This would let an editor
  change how a tool calculates, not only its inputs. But landing's
  `compute.ts` files are tested, and code in the database is not. A change
  there could give a citizen a wrong severance or pension figure with no test
  to catch it. Rejected.
- **A general `json` field type.** This would store the tool data in its
  current shape, with no flattening. But editors would edit raw JSON, where
  one missing comma breaks a record. Rejected.
- **Editors type the records in by hand.** This needs no import. But Find an
  emergency shelter alone has 70 records, and Find an open pharmacy has 163.
  Typing them is slow, and nothing would check them against the data they
  replace. Rejected.

## Consequences

- Each tool issue (#3205–#3210) names its collection and how its data is
  flattened into fields. A tool whose data needs a nested object or a list of
  objects as one field is a change to this decision. Find an open pharmacy
  has two such fields today, `verification` and `bankHolidayHours`, and
  #3206 decides how each is flattened or dropped.
- Landing's collection reader parses each record's values as strings
  (`data` in `api-v2-collections.ts`). It must accept the new field types
  (#3782). If it doesn't, a typed record reads as malformed and the tool
  falls back to its in-code data with no error to show it.
- A calculator's tests cover its code, not the rates an editor stores. A
  wrong rate in api_v2 gives a wrong answer until an editor corrects it.
- Landing parses and checks values that an editor types as text, such as the
  opening hours.
- The water outages feed doesn't move off api v1 under this decision.
- An editor sees a feature-route page's record in editor_v2 like any other
  page. Editing its body changes nothing. Editing its title or description
  changes only the listing card and the search result. Changing its
  visibility changes only the listings: the page stays live at its URL.
  Warning editors about this needs its own issue (option 3 in #3256).
- The in-code data and the fallback can be removed from a tool only after
  every environment has had its cutover and records import.
