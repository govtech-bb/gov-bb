# Design: Form `closingDateTime` → "Applications have closed"

Issue: [#1936](https://github.com/govtech-bb/gov-bb/issues/1936)

## Problem

A form (e.g. the National Science Camp 2026 application) has a real-world
application deadline. After that deadline citizens can still open the form,
start an application, and submit it — there is no time-based gating today. We
want: after a form's closing date/time passes, citizens see an "Applications
have closed" page instead of being able to start or submit, with the responsible
MDA's contact details shown so they know who to reach.

## Scope decisions (agreed)

- **Field placement:** authored as **`meta.closingDateTime`** on the recipe
  (extends the existing extensible `meta` container, alongside `meta.visibility`).
- **Optional for all recipes.** Absent → no deadline, behaviour unchanged.
- **Enforcement reaches both frontends plus a server-side guard:**
  1. **apps/forms** — renders the full closed page (the mockup) and blocks the flow.
  2. **apps/landing** — hides "Start now" and shows a closed banner.
  3. **API submission handler** — rejects a submission received after the deadline
     (belt-and-braces; the only truly enforce-able layer against direct POSTs).
- **Timezone:** deadlines are stored as ISO-8601 **with offset**; comparison uses
  absolute instants (timezone-safe). Display formats in **AST**
  (`America/Barbados`, UTC−04:00, no DST).
- **MDA contact is sourced dynamically** from the served contract's
  `contactDetails` (populated from the `mda_contact` directory via
  `form_config.mdaContactId`) — never hardcoded.

## Architecture

The served contract flows API → apps/forms; apps/landing renders from a static
content registry and only fetches lightweight formId lists. So `closingDateTime`
reaches forms on the contract, and landing via a new "closed formIds" list
endpoint parallel to the existing `/maintenance` one.

### 1. Types — `packages/form-types/src/service-contract.type.ts`

- Add optional `closingDateTime: dateTimeFormatSchema.optional()` to
  `recipeMetaSchema` (recipe authoring shape).
- Add optional `closingDateTime` to `serviceContractSchema` (the *served* wire
  contract has no `meta`, so it rides as a top-level optional field).

### 2. Hydration — `apps/api/src/registry/resolution.ts`

- `hydrateForm` copies `recipe.meta?.closingDateTime` onto the returned
  contract. (Known allowlist gotcha: fields not explicitly copied are dropped.)

### 3. Formatter — shared helper `formatClosingDateTime(iso: string): string`

- Returns e.g. `"Thursday, 9 July 2026 at 11:59pm"` via
  `Intl.DateTimeFormat('en-GB', { timeZone: 'America/Barbados', weekday, day,
  month, year, hour, minute, hour12 })`, post-processed to the mockup's
  lowercase no-space `am/pm`.
- Home: `packages/form-types` (shared by forms + landing), or a small util in
  each app if a cross-package util home is awkward — decided in the plan.
- A predicate `isClosed(iso: string, now: Date): boolean` (past = closed) lives
  next to it and is the single source of the comparison.

### 4. API closed-forms endpoint — `form-definitions` controller + service

- `GET /form-definitions/closed` → `{ data: string[] }` of formIds that are
  **public** AND whose `meta.closingDateTime` is in the past (server evaluates
  "now"). Declared before `:formId`, mirroring `@Get("maintenance")`.
- Service method `findClosedFormIds()` mirrors `findMaintenanceFormIds()`'s
  source dispatch (recipe-file loader vs DB entries). Because the summary entry
  list does not currently carry `closingDateTime`, the method resolves each
  candidate recipe's `meta.closingDateTime` (thread `closingDateTime` onto the
  internal summary, or read it during the closed-scan) — resolved in the plan.

### 5. Submission guard — `apps/api/src/forms/submissions/submissions.service.ts`

- In `submit()`, after `pipeline.run(dto)` yields `contract`, if
  `contract.closingDateTime` is in the past, throw
  `AppError.badRequest("Applications for this form have closed")` before
  persisting. Smoke submissions (`dto.isSmokeSubmission`) bypass the guard so the
  live-smoke gate is never affected.

### 6. Forms app closed page — `apps/forms/src/routes/forms/$formId/index.tsx`

- Loader fetches the contract; if `isClosed(contract.closingDateTime, now)`,
  return a `{ closed: true, contract }` result and the route renders a new
  `<ApplicationClosed contract={contract} />` instead of the form.
- `<ApplicationClosed>` (new component) renders per the mockup: eyebrow/service
  name, heading `Applications for {title} have closed`, sub-text, a closed-window
  inset (`Application closed` + `formatClosingDateTime(...)`), and a contact
  block built from `contract.contactDetails` (title / email / telephoneNumber) —
  reusing the contact markup pattern from `submission-confirmation.tsx`.
- `ClientServiceContract` (`apps/forms/src/types/field-mapper.type.ts`) gains
  `closingDateTime`; the client re-parse via `serviceContractSchema` already
  carries it once (1) lands.

### 7. Landing gate — `apps/landing`

- `available-forms.ts`: add `getClosedForms()` `createServerFn` calling
  `GET /form-definitions/closed` (same cache/last-known-good pattern as
  `getMaintenanceForms`).
- `$.tsx` loader: compute `applicationClosed` for the page's `form_id` (in the
  closed list). Hide "Start now" via the existing `shouldHideStartLink` path and
  render a closed `<StatusBanner variant="service-issue">` notice (new
  `ApplicationClosedNotice`, modelled on `MaintenanceNotice`). Maintenance takes
  precedence if a form is somehow both.

### 8. Seed recipe

- `apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026.json`:
  add `"closingDateTime": "2026-07-09T23:59:00-04:00"` inside `meta`.

## Testing (TDD)

- **form-types:** `recipeMetaSchema` accepts/omits `closingDateTime`;
  `serviceContractSchema` carries it; `isClosed` past/future/now boundary;
  `formatClosingDateTime` renders the exact mockup string (incl. the seed value).
- **resolution:** `hydrateForm` threads `meta.closingDateTime` → contract; absent
  meta → undefined.
- **api service:** `findClosedFormIds` returns only public + past-deadline forms;
  excludes future, unset, and non-public.
- **submission guard:** past deadline → 400; future/unset → proceeds; smoke
  bypasses.
- **apps/forms:** loader/route renders `<ApplicationClosed>` when past, the form
  when not; contact block renders from `contactDetails`.
- **apps/landing:** `getClosedForms` parsing; `$.tsx` hides start link + shows
  notice for a closed `form_id`.

## Out of scope

- Admin UI to set closing dates (authored in the recipe JSON for now).
- A "reopen"/countdown/"closes in N days" pre-deadline banner.
- Per-environment overrides of the closing time (recipe is the single source;
  mirrors how visibility works before service_status overrides — not needed here).

## Acceptance criteria (from #1936)

- [ ] `closingDateTime` optional, usable by any recipe; recipes without it unaffected.
- [ ] Threaded through hydration to the served contract (no silent drop).
- [ ] Past-deadline form renders the closed page and cannot be started/submitted
      (incl. deep-link into apps/forms and direct API POST).
- [ ] Future/unset deadline behaves as today.
- [ ] Closed page shows the formatted deadline and MDA name/email/phone sourced
      dynamically.
- [ ] Summer-camp 2026 recipe closes 9 July 2026 at 11:59pm AST.
