# Request an environmental health officer — integration design

**Date:** 2026-08-10
**Prototype:** https://govtech-bb.github.io/newforms/Prototypes/environmental-health-officer-request.html
**Owning MDA:** Ministry of Health and Wellness — Environmental Health Department
**Target form id:** `request-an-environmental-health-officer`
**Sibling service:** `apply-for-temporary-restaurant-licence` (recipe already in tree, `visibility: draft`)

> Decisions taken at brainstorming, recorded here so the plan does not re-open them:
>
> 1. **Merged journey**, as prototyped — the form requests an officer and, when the
>    requester is also serving food, completes their temporary restaurant licence
>    application in the same run.
> 2. **The 14-day lead time blocks**, matching the sibling licence recipe. This
>    knowingly departs from the prototype's warn-not-block change; see §8.
> 3. **One landing content page** (`index.md`), no `start.md`.
> 4. **Cross-link the licence `index.md` only.** The licence `start.md` is being
>    removed separately by its author, so nothing is added to it.
> 5. **Ships as `meta.visibility: draft` + page `visibility: preview`**, matching
>    the sibling licence service.
> 6. **The prototype's commenting feature is not transferred.**

---

## 1. What the prototype is

A request run by the Environmental Health Department for the **organiser** of an
event where food or drink is served to the public. Officers attend the event to
carry out public-health surveillance; the organiser carries any overtime cost.

The prototype's first question — *"Are you operating a temporary restaurant
(serving food) at this event?"* — decides how much of the journey runs. Answer
**Yes** and the service also collects the temporary restaurant licence
application (food served, food-safety arrangements, the requester's own medical
certificate), telling the user explicitly that they do **not** need to complete a
separate licence form.

Prototype flow (`FLOW`, filtered by `getFlow`):

```
start → operating-restaurant → applicant-details → event-details
      → [food-details] → [food-safety] → documents → check
      → declaration → confirmation
```

`food-details` and `food-safety` are removed from the flow entirely when
`operating-restaurant !== 'Yes'`.

This mirrors the licence form from the other direction: the licence recipe's
`event-organiser` step tells an organiser *"We will request an officer for you
when you submit this application… You do not need to fill out a separate Request
an environmental health officer form."* Whichever door the user walks in, one
submission covers the whole job. That symmetry is deliberate and is preserved.

## 2. Feasibility — recipe and content only

Every behaviour the prototype needs already exists in the platform. The sibling
licence recipe established the hard parts:

| Prototype behaviour | Platform mechanism | Precedent |
|---|---|---|
| Address typeahead → coordinates + parish | `components/address-lookup` with `geocodeTargets` | licence `event-details` |
| Route to the polyclinic serving the event | `catchmentRouting` (coordinates, parish fallback) | licence top level |
| Higher-risk food categories, accordion | `components/generic-checkbox-accordion` with `higherRisk` groups | licence `food-details` |
| Revealed follow-up fields | `fieldConditionalOn` behaviour | throughout |
| Whole step skipped | `stepConditionalOn` step behaviour | new here; schema + renderer + hydration all present |
| Inset notices, "why we ask" disclosures | `components/content` variants `inset` / `text` / `details` | licence `event-organiser` |
| Email to the assigned department | `email` processor with `recipientField: catchment.mdaEmail` | licence `processors` |
| Name the assigned polyclinic on the confirmation | `{polyclinic}` placeholder in `markdownContent` | licence `submission-confirmation` |

`stepConditionalOn` is the only mechanism not already exercised by the sibling.
It is verified end to end: declared in
`packages/form-types/src/behavior.type.ts`, carried through hydration by
`apps/api/src/registry/resolution.ts:88` (`behaviours: step.behaviours`), and
honoured by `isStepVisible` in
`apps/forms/src/lib/form-builder/helpers/behavior-helper.ts`.

**No `apps/forms` renderer change, no new registry component, no API code
change.** This is a recipe plus a content page.

## 3. Files

| File | Action |
|---|---|
| `apps/api/src/forms/form-definitions/recipes/request-an-environmental-health-officer.json` | new |
| `apps/landing/src/content/request-an-environmental-health-officer/index.md` | new |
| `apps/landing/src/content/apply-for-temporary-restaurant-licence/index.md` | edit — add one cross-link |

The filename must equal the `formId`. Reference codes derive from the formId's
segment initials (`apps/api/src/forms/submissions/reference-code.ts`), giving
`RAEHO-…`; no explicit `prefix` is set.

## 4. Recipe design

### 4.1 Top level

```
formId          request-an-environmental-health-officer
title           Request an environmental health officer
description     Request an environmental health officer to attend an event where
                food or drink is served to the public.
contactDetails  Ministry of Health and Wellness / info@health.gov.bb /
                +1 (246) 536-3800
catchmentRouting  coordinatesField: event-details.event-address-coordinates
                  parishField:      event-details.event-parish
meta.visibility draft
```

`processors`, copied in shape from the licence recipe:

1. `email` — acknowledgement to `applicant-details.email`, subject *"Your
   request for an environmental health officer has been received"*.
2. `email` — notification to `catchment.mdaEmail`, subject *"A new request for
   an environmental health officer has been received"*.
3. `webhook` — `programmeCode: ENV_HEALTH_OFFICER_REQUEST`, applicant name from
   the two name fields, `email`/`phone` mapped, `groupByStep: true`,
   `excludeSteps: [check-your-answers, declaration, submission-confirmation]`.

### 4.2 Steps

The prototype's `start` screen becomes the landing page, not a form step.

| # | `stepId` | Title | Source screen |
|---|---|---|---|
| 1 | `operating-restaurant` | Are you operating a temporary restaurant? | `operating-restaurant` |
| 2 | `applicant-details` | Your details | `applicant-details` |
| 3 | `event-details` | About the event | `event-details` |
| 4 | `food-details` | What food and drink will you serve? | `food-details` |
| 5 | `food-safety` | Food safety | `food-safety` |
| 6 | `documents` | Supporting documents | `documents` |
| 7 | `check-your-answers` | Check your answers | `check` |
| 8 | `declaration` | Declaration | `declaration` |
| 9 | `submission-confirmation` | Request submitted | `confirmation` |

The gate question comes **first**, as in the prototype, because steps 4–6 and 8
depend on it and a later answer would strand the user mid-journey.

**Step 1 — `operating-restaurant`.** A `generic-radio` (`fieldId:
operating-restaurant`, options `yes` / `no`, required) carrying the prototype's
hint about what a temporary restaurant is. Two `components/content` blocks
follow, both `fieldConditionalOn operating-restaurant equal yes`: an `inset`
explaining that the request now also covers the licence, and a `text` block
confirming no separate licence form is needed.

**Step 2 — `applicant-details`.** Ten fields, taken from the licence recipe's
equivalent step **minus National Registration Number** — the prototype drops it,
and its "What you'll need" list asks only for name, address, phone and email:
`first-name`, `middle-name` (optional), `last-name`, `address` ×2 (line 2
optional), `parish`, `mobile-telephone`, `home-telephone` (optional),
`work-telephone` (optional), `email`.

**Step 3 — `event-details`.** Structurally the licence recipe's `event-details`,
with the differences noted:

- `generic-text` `event-name`, required.
- `address-lookup` `event-address-line-1` with `geocodeTargets` pointing at
  `event-address-line-2`, `event-parish`, `event-address-coordinates`.
- `address` `event-address-line-2`, optional.
- `parish` `event-parish`, required — the catchment fallback when no suggestion
  is picked, so the journey never depends on the lookup succeeding.
- `generic-text` `event-address-coordinates`, `ui.hidden: true`, optional.
- `generic-date` `event-from`, required, `min: 14` / `transform: daysUntil`
  (see §8).
- `generic-date` `event-to`, required, `onOrAfter` `event-from`.
- `generic-time` `event-start-time` and `event-end-time`, both required.
- `components/content` `variant: details`, summary *"Why you do not choose
  officer times"* — the prototype's `regNote()`, citing the Health Services
  (Assignment of Public Health Inspectors to Private Businesses) Regulations,
  1986. **Unconditional here**, unlike the licence recipe where it is gated on
  `is-organiser = yes`: in this service the requester is always the organiser.
- `components/content` `variant: text` carrying the prototype's event-size
  preamble ("Give your best estimate. We know these numbers change — you will
  not be penalised if they do.").
- `generic-number` `num-patrons` and `num-stalls`, both required, `min: 0`. Also
  unconditional here, for the same reason.

**Step 4 — `food-details`.** Step behaviour `stepConditionalOn`
`operating-restaurant` / `operating-restaurant` `equal` `yes`.

- `generic-checkbox-accordion` `food-served` — the ten groups copied verbatim
  from the licence recipe, including the `other` option and the four
  `higherRisk: true` groups (meat and poultry, seafood, dairy, eggs).
- `generic-textarea` `other-food-description`, revealed by `food-served in
  ["other"]`, required when shown.
- **Food source, redesigned — see §5.1.** One `generic-checkbox`
  `food-source` with options `supplier` and `caterer`, required. Revealed by
  `food-source in ["supplier"]`: `generic-textarea` `supplier-details`
  (required). Revealed by `food-source in ["caterer"]`: `generic-text`
  `caterer-name` (required), `address` `caterer-address` (required),
  `generic-tel` `caterer-phone` (required), `generic-email` `caterer-email`
  (optional), and a `content` `text` block noting their licence is not needed.
  All revealed fields carry `ui.indent: true`.

**Step 5 — `food-safety`.** Same step behaviour as step 4. The licence recipe's
six fields (`has-food-licence` radio, `handlers-male`, `handlers-female`,
`water-source`, `handwashing`, `waste-disposal`) plus the prototype's two new
`content` `details` disclosures, placed before the fields they explain:

- *"Why we ask, and what officers may check on the day"* — hygiene and
  protective-clothing rules, each handler carrying their own certificate, and a
  link to the guidance page's `#personal-hygiene` section.
- *"Why we ask about water and sanitation"* — running water is mandatory, ask
  the organiser but come prepared, and a link to `#keeping-food-safe`.

**Step 6 — `documents`.** All uploads use `components/upload-document`.

| `fieldId` | Required | Condition | Types |
|---|---|---|---|
| `vendor-list` | yes | always | PDF, JPG, PNG, DOC, DOCX |
| `site-plan` | yes | always | PDF, JPG, PNG |
| `medical-certs` | yes | `operating-restaurant = yes` | PDF, JPG, PNG |
| `food-licence` | no | `operating-restaurant = yes` | PDF, JPG, PNG |

`vendor-list` and `site-plan` are unconditionally required because in this
service the requester is always the organiser — the licence recipe gates them on
`is-organiser`. `medical-certs` is **single**, not `multiple: true` as on the
licence: the prototype asks only for the requester's own certificate, and a
`content` `inset` (conditional on `yes`) explains that everyone else must carry
theirs on the day.

**Step 7 — `check-your-answers`.** Platform-managed. `elements: []`,
`behaviours: []`, description as on the licence recipe. Not authored.

**Step 8 — `declaration`.** Three `components/confirmation` elements:

| `fieldId` | Condition | Content |
|---|---|---|
| `declaration-confirmed` | always | Information is correct, happy for it to be verified, false details may lead to rejection, government keeps it confidential |
| `regulations-acknowledged` | `operating-restaurant = yes` | Will operate the temporary restaurant in accordance with the Health Services (Restaurants) Regulations, 1969 |
| `overtime-costs-acknowledged` | always | The organiser is responsible for officers' overtime costs |

All three required when shown. `overtime-costs-acknowledged` is unconditional
here (the licence gates it on `is-organiser`). The split into three is forced —
see §5.2.

**Step 9 — `submission-confirmation`.** `markdownContent` using the
`{polyclinic}` placeholder, covering: where the copy was sent, that the named
department reviews the request, that officers attend on the dates given and the
department confirms arrangements and overtime, that an invoice follows any
overtime cost, and to keep the reference number. Licence-specific outcomes are
phrased conditionally in prose ("If you are also operating a temporary
restaurant, …") — see §5.3.

## 5. Where this departs from a literal port

Three places. Each is a consequence of the DSL, not a preference.

### 5.1 Food source becomes one checkbox with two options

The prototype uses two independent checkboxes — *Supplier* (revealing a free-text
list) and *Caterer or cook* (revealing name, address, phone, email) — and
validates that **at least one** is ticked. Two separate single-option checkbox
fields cannot express *at-least-one-of-the-pair*: each is independently optional
or independently required.

One `generic-checkbox` with both options and `required: true` gives the same UI
and one honest validation. The revealed fields hang off it with `operator: "in"`,
which set-intersects against the checkbox's `string[]` value
(`packages/form-conditions/src/internals.ts:138`) — the same pattern the food
accordion already uses for `other`.

This also adopts the prototype's later m1 research finding, which split the
question so that ingredients are free text and a caterer is contact details. The
licence recipe predates that finding and still has a single `food-from-supplier`
checkbox with a supplier name/address/phone/email block. **The two services will
word this question differently until the licence recipe catches up** — logged in
§8.

### 5.2 The declaration splits into three checkboxes

The prototype appends the 1969 Regulations sentence to the first declaration
checkbox only when the user is serving food. One field cannot carry two labels,
and two conditional variants of the same checkbox would need two `fieldId`s and
so two different submission keys for the same consent.

Instead the 1969 undertaking becomes its own conditional checkbox. A user serving
food ticks three boxes; one requesting officers only ticks two. Slightly more
clicking, but each consent is a distinct record — which is arguably the better
shape for a legal undertaking anyway.

### 5.3 The confirmation page cannot branch

`markdownContent` is static. The prototype's confirmation varies on two axes —
whether the user is operating a restaurant, and whether they already hold a food
business licence (which decides whether an inspection is promised or only
possible). Neither is expressible.

The page will be written to cover both cases in prose. This is a genuine fidelity
loss: a user requesting officers only will read a sentence about licences that
does not apply to them. Recorded in §8 as a candidate for a future conditional
`markdownContent`.

## 6. Landing content

### 6.1 New page

`apps/landing/src/content/request-an-environmental-health-officer/index.md`.

Frontmatter: `title: "Request an environmental health officer"`, `description`,
`stage: alpha`, `visibility: preview`, `featured: false`,
`publish_date: 2026-08-10`, `category: business-trade`,
`form_id: request-an-environmental-health-officer`, `service_type: digital`.

Body from the prototype's `start` screen, section for section: intro, *Who needs
to request an officer*, *When to apply and what it costs*, *What you'll need*
(split into the always-needed list and the extra list for people serving food),
the Start button, *What happens next*, *Contact us*.

The prototype's relative links rewrite to real routes. Every target anchor was
verified present on the guidance page — note that two of the prototype's anchors
are abbreviations that do not match the real heading slugs:

| Prototype href | Landing route |
|---|---|
| `temporary-restaurant-licence.html` | `/business-trade/apply-for-temporary-restaurant-licence` |
| `temporary-restaurant-guidance.html#what-counts` | `/business-trade/temporary-restaurants-what-you-need-to-know#what-counts-as-a-temporary-restaurant` |
| `…#setting-up-your-stall` | `…/temporary-restaurants-what-you-need-to-know#setting-up-your-stall` |
| `…#personal-hygiene` | `…#personal-hygiene-for-food-handlers` |
| `…#keeping-food-safe` | `…#keeping-food-safe` |
| `…#contact-us` | `…#contact-us` |

The call to action is a bare `<a data-start-link>Start now</a>` with **no query
parameters**. `StartLink` bakes the frontmatter `form_id` onto it and resolves
`${VITE_FORMS_URL}/forms/<formId>`
(`apps/landing/src/components/markdown/StartLink.tsx:44`); it renders nothing
while the recipe is `draft`, which is the intended state at merge. Hardcoding
`?preview=…` would leak `PREVIEW_SECRET` into the client bundle and fail the
Amplify build.

### 6.2 Cross-link from the licence page

One addition to `apply-for-temporary-restaurant-licence/index.md`, in the *Who
needs a licence* section — the only place on that page where the
organiser/vendor split is already explained.

The wording must not contradict the licence form itself, which tells an organiser
*"We will request an officer for you… You do not need to fill out a separate
Request an environmental health officer form."* So the link is framed as **the
organiser's door**, not as a second task for someone already applying:

> If you are organising the event but not serving food yourself, you do not need
> a licence — use [Request an environmental health officer](/business-trade/request-an-environmental-health-officer)
> instead.

That is true and non-overlapping: an organiser who serves food uses the licence
form (which requests the officer for them); an organiser who does not serve food
uses the officer service. **Wording approved 2026-08-10.**

Nothing is added to `apply-for-temporary-restaurant-licence/start.md` — that page
is deleted by PR #2242 (*chore(landing): remove orphaned temporary restaurant
start page*), open against `main` at the time of writing. This branch rebases on
`main` once #2242 lands; the two changes touch different files and do not
conflict.

Note that #2242 removes only `start.md`. The commented-out "Apply online" block
in the licence `index.md` — which carries an explicit
`href="/business-trade/apply-for-temporary-restaurant-licence/start"` — is left
behind by it, pointing at a route that will no longer resolve. It is inert
(commented out, so never rendered) and out of scope here; see §8.6.

## 7. Not transferred

**By instruction:** the commenting feature (`comments.js`).

**Dev scaffolding, no production meaning:** `autofill.js`; the `?dev` draft-note
system (`SHOW_DRAFT_NOTES`, `confirmNote()`) and the two notes it renders.

**Superseded by platform mechanisms:**

- The Leaflet map, the inline 98 KB catchment GeoJSON, and the client-side
  `GOVBB_BACKEND.assignPolyclinic` point-in-polygon. Server-side
  `catchmentRouting` replaces all of it. (The prototype's own comments record
  that the map was dropped after meeting 3 testing anyway.)
- The direct Nominatim call and the bundled landmark gazetteer.
  `components/address-lookup` owns geocoding; the prototype's own comment notes
  Nominatim's usage policy does not cover production traffic.
- `POLYCLINIC_CONTACTS`, the hardcoded per-office phone/email map — the
  catchment service supplies `catchment.mdaEmail`.

**Fidelity losses, accepted:**

- The live *"📍 Branford Taitt Polyclinic serves this location"* card on the
  event step. The platform reveals the assigned polyclinic at the confirmation
  step instead, via the `{polyclinic}` placeholder. **Settled, not open:** the
  same call was already made for the sibling licence recipe, whose
  `event-details` step likewise carries no live routing feedback and whose
  `submission-confirmation` names the polyclinic. Matching it keeps the two
  services consistent.
- The prototype's client-side non-blocking 14-day warning (§8).
- Confirmation-page branching (§5.3).
- *Print this page* and *Start another request* on the confirmation.

**Dead code in the prototype:** `officerDateTimes()`, `addOfficerDateTime()` and
`removeOfficerDateTime()` — a repeatable "date + start/end time" block that is
defined but never called by any page in `PAGES`. Not ported. If per-date officer
attendance was ever intended, it is unbuilt in the prototype and should be raised
with the MDA rather than inferred.

## 8. Open questions and flagged inconsistencies

These are recorded, not resolved. None blocks implementation.

1. **The 14-day rule blocks, against the prototype's research.** The prototype
   deliberately replaced a hard block with a warning, citing consolidated
   finding C1 (*Critical, 6 of 8*): the rule "blocked exactly the last-minute
   applicants who most need to avoid a trip to the polyclinic", staff confirmed
   an exception path already exists at the Principal's discretion, and endorsed
   warning over blocking unprompted. The decision here is to block, matching the
   sibling licence recipe. Worth noting that the warn behaviour **is**
   expressible with no code change — a `content` block with
   `fieldConditionalOn` `operator: "lt"`, `transform: "daysUntil"`, `value: 14`
   — so this is reversible cheaply if MOH revisits it. It would need to change in
   both recipes together.
2. **Food-source wording diverges from the licence recipe** (§5.1) until the
   licence catches up with the m1 finding.
3. **Food handlers split by sex.** The prototype carries a draft note saying
   whether handlers should be split male/female or counted as one total is under
   review. Ported as-is (split), matching the licence recipe.
4. **Webhook destination — fixed.** The recipe's own
   `programmeCode: "ENV_HEALTH_OFFICER_REQUEST"` is never emitted while a
   catchment resolves: `webhook.processor.ts` passes
   `resolvedCatchment?.programmeCode` as an override, and `webhook-mapping.ts`
   resolves `programme_code: programmeCodeOverride ?? mapping.programmeCode`,
   so the override wins whenever `catchmentRouting` is present, as it is here.
   `polyclinic-routing.ts` now keys its programme codes by **formId then
   catchment** (`PROGRAMME_CODES_BY_FORM`), so this form's submissions resolve
   to its own `ENV_HEALTH_OFFICER_*` codes instead of the licence form's
   `TEMP_RESTAURANT_LICENCE_*` codes for the same catchment.
   `CatchmentRoutingService.onModuleInit` validates every form's map against
   the GeoJSON catchments at boot. One deliberate asymmetry: `Frederick Miller
   Polyclinic` has no Environmental Health Department and no officer-request
   queue of its own, so it reuses `ENV_HEALTH_OFFICER_ST_PHILIP` rather than
   getting its own code (service owner decision, 2026-08-10) — the licence
   form is unaffected and keeps its own Frederick Miller code.
   `docs/webhook-destinations.md` now documents the mechanism as per-form,
   naming both catchment-routed forms.
5. **Dangling `/start` reference.** PR #2242 deletes the licence `start.md` but
   leaves the commented-out block in the licence `index.md` that links to it. The
   reference is inert, but this design edits that same file, so clearing it here
   would cost nothing if wanted. Left alone by default, on the rule that changed
   lines should trace to the request.
6. **Adjacent, out of scope:** the guidance page
   `temporary-restaurants-what-you-need-to-know.md:12` still carries a leftover
   prototype link, `[applying for a temporary restaurant licence](temporary-restaurant-licence.html)`,
   which does not resolve. Flagged only; not touched by this work.

## 9. Verification

1. `pnpm exec nx run api:test` and `pnpm exec nx run forms:test` — the recipe
   must validate against `serviceContractRecipeSchema`, which is where a bad
   `ref`, a non-kebab `fieldId` or a malformed behaviour surfaces.
2. `pnpm exec nx run-many -t build --exclude=landing` — `landing`'s prebuild
   fetches a live forms API, so it is built by CI, not locally.
3. Local walk of the served form, both branches:
   - `operating-restaurant = no` → steps 4 and 5 absent from the flow and from
     check-your-answers; `documents` shows two uploads; `declaration` shows two
     checkboxes.
   - `operating-restaurant = yes` → steps 4 and 5 present; four uploads; three
     checkboxes.
   - An event start date under 14 days away blocks with the authored error.
   - Picking an address suggestion populates parish and coordinates; the
     confirmation names the expected polyclinic.
4. Landing page renders at `/business-trade/request-an-environmental-health-officer`
   with `?preview`, all rewritten links resolve, the Start button is suppressed
   (recipe is `draft`), and no href contains a preview token.

## 10. Success criteria

- The recipe validates and serves; both branches of the gate behave as in §9.3.
- The new page renders in preview with working cross-links, and the licence page
  links to the new service without contradicting the licence form's own copy.
- Full build green; `api` and `forms` test suites green.
- No change to `apps/forms`, `packages/registry` or `packages/form-types`.
