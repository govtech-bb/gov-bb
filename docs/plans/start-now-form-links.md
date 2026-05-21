# Start now → forms-app links (revision 2)

**Status:** Planned. Supersedes the initial registry-based delivery
described in the prior version of this plan.

## Goal

Every "Start now" call-to-action on the landing app routes the user to
the real form in the forms app **only if** the form actually exists in
the forms API. Content authors declare a page's form ID in frontmatter;
the build pipeline validates against the live API; the runtime check is
a fast in-memory lookup. No hand-maintained ID registry.

## Why the change

The earlier delivery shipped a `FORM_IDS` map in
`apps/landing/src/content/form-ids.ts` and gated rendering on it. Two
problems surfaced once the lead reviewed it:

1. **It's a parallel database.** Every time the forms team adds, renames,
   or removes a form, someone has to remember to edit this file.
   Forgetting silently breaks Start now buttons.
2. **It's already wrong.** Shannon renamed the API formIds (dropped the
   `*-test` suffixes, removed YouthADVANCE Corps Recruitment). The
   committed `FORM_IDS` still references the old values.

Shannon's directive: drive availability and the formId values off the
forms API itself, not off a checked-in file.

## Approach

A **build-time fetch** of `${VITE_FORMS_API_URL}/form-definitions`
produces a generated manifest of available formIds. The landing app
ships that manifest in its bundle. Per-page **frontmatter `form_id`**
declares which formId each start page maps to. At render time the
anchor handler consults the manifest; if the form exists, the Start now
button renders pointing at `${VITE_FORMS_URL}/forms/${form_id}`; if it
doesn't, the button is silently suppressed (with a dev-mode console
warning).

```
build:                      vite prebuild
  fetch ${VITE_FORMS_API_URL}/form-definitions
  → write src/content/available-forms.gen.ts
      export const AVAILABLE_FORMS = new Set([
        "get-birth-certificate", "jobstart-plus-programme", …
      ])

render (page with frontmatter form_id: jobstart-plus-programme):
  Markdown body contains: <a data-start-link>Start now</a>
  Anchor handler reads form_id from frontmatter context
  → form_id in AVAILABLE_FORMS?
      yes → <LinkButton href="${VITE_FORMS_URL}/forms/jobstart-plus-programme">
      no  → render nothing (dev warn)
```

### Key shape decisions

- **Frontmatter is the declarative source.** Each `start.md` (or
  single-file page) that should have a Start now button gets a
  `form_id: <api-formId>` field in its frontmatter. Content authors
  always know which form a page points at by looking at the top of the
  file. Slug-matching is **not** assumed — the formIds and the landing
  slugs only happen to align for some services.
- **Authors keep button placement control.** The Markdown body keeps
  the explicit `<a data-start-link>Start now</a>` marker. The anchor
  renderer reads `form_id` from a React context populated by
  `MarkdownContent` from the page's frontmatter. This lets a page have
  zero, one, or multiple Start now buttons positioned wherever the
  author writes them.
- **`href` attribute is dropped on `data-start-link` anchors.** Authors
  no longer write `href="form:<slug>"` — the formId comes from
  frontmatter, not from the href. The `urlTransform` and `form:` scheme
  added in revision 1 go away.
- **Manifest is generated, gitignored, and treated as a build
  artifact.** Lives at `apps/landing/src/content/available-forms.gen.ts`.
  Pre-build script writes it; `nx dev` runs the script as `predev` so
  local dev has a fresh manifest at startup.
- **Build fails when the API is unreachable.** Better a loud deploy
  failure than silently shipping a landing with zero Start now buttons.
- **Two env vars, two purposes.** `VITE_FORMS_API_URL` is the
  build-time API URL (server-to-server fetch). `VITE_FORMS_URL` is the
  user-facing forms app URL embedded in the resolved button href.

### Alternatives considered

- **Per-page HTTP fetch at render time** (Shannon's other suggestion).
  Discoverability without redeploy, but every content page makes an API
  call, and the button "pops in" after the fetch. Overkill for a
  once-a-deploy data source.
- **Form ID in the href (`href="form:jobstart-plus-programme">`)**.
  Author writes the formId directly; renderer validates against the
  manifest. Simpler than frontmatter + context, but the formId is then
  buried inside the markdown body instead of being a discoverable
  metadata field at the top of the file. Rejected on
  discoverability grounds.
- **Mass-rename the 5 mismatched landing slugs.** Changes user-facing
  URLs and would need redirect handling. Frontmatter `form_id` avoids
  the rename entirely.

## Scope

- Write a pre-build script `scripts/fetch-form-manifest.ts` that hits
  `${VITE_FORMS_API_URL}/form-definitions`, validates the response, and
  emits `apps/landing/src/content/available-forms.gen.ts` exporting an
  `AVAILABLE_FORMS: ReadonlySet<string>`.
- Wire `predev` and `prebuild` scripts in
  `apps/landing/package.json` so the manifest is fresh in both dev and
  CI.
- Add `form_id: <api-formId>` to the frontmatter of every `start.md`
  and single-file page that should have a Start now button. **Drop**
  YouthADVANCE Corps for now (no API form). Drop any others whose
  formIds don't exist in the live API.
- Extend `lib/frontmatter.ts` `FrontmatterSchema` with optional
  `form_id` field.
- Rework `MarkdownContent.tsx`:
  - Provide a `FormIdContext` populated from the page's frontmatter.
  - Anchor handler: when `data-start-link` is present, read `form_id`
    from context; if present and in `AVAILABLE_FORMS`, render
    `<StartLink href={`${VITE_FORMS_URL}/forms/${form_id}`}>`; else
    render `null` (with `console.warn` in dev when a `form_id` exists
    but isn't in the manifest).
  - Remove the `form:` href scheme, the `urlTransform`, and the
    `resolveFormHref` import.
- Delete `apps/landing/src/content/form-ids.ts`.
- Update `apps/landing/.env.example` to document both
  `VITE_FORMS_API_URL` and `VITE_FORMS_URL`.
- Update the 13 `start.md` / single-file pages: remove
  `href="form:<slug>"` from their `<a data-start-link>` tags, leaving
  `<a data-start-link>Start now</a>`.
- Per-slug analytics: `StartLink` continues to emit a `<form_id>-start`
  Umami event derived from the resolved form_id (preserves the
  funnel-metric convention from `0002-umami-tracking`).

## Mapping (landing slug → API formId, declared via frontmatter)

| Landing page (slug)                                | `form_id` in frontmatter                 |
| -------------------------------------------------- | ---------------------------------------- |
| `apply-for-conductor-licence`                      | `apply-for-conductor-licence`            |
| `apply-to-be-a-project-protege-mentor`             | `project-protege-mentor`                 |
| `apply-to-jobstart-plus-programme`                 | `jobstart-plus-programme`                |
| `apply-to-the-barbados-youthadvance-corps`         | _(omit — not in API)_                    |
| `get-birth-certificate`                            | `get-birth-certificate`                  |
| `get-death-certificate`                            | `get-death-certificate`                  |
| `get-marriage-certificate`                         | `get-marriage-certificate`               |
| `post-office-redirection-business`                 | `post-office-redirection-business`       |
| `post-office-redirection-deceased`                 | `post-office-redirection-deceased`       |
| `post-office-redirection-individual`               | `post-office-redirection-individual`     |
| `register-for-community-sports-training-programme` | `community-sports-training`              |
| `register-summer-camp`                             | `national-summer-camp-2025-registration` |
| `sell-goods-services-beach-park`                   | `sell-goods-services-beach-park`         |

## Files

**Added**

- `apps/landing/scripts/fetch-form-manifest.ts` (or
  `scripts/fetch-form-manifest.ts` at repo root — TBD per convention)
- `apps/landing/src/content/available-forms.gen.ts` _(gitignored,
  generated)_

**Modified**

- `apps/landing/package.json` — add `predev` and `prebuild` script
  entries.
- `apps/landing/.env.example` — document `VITE_FORMS_API_URL` and
  `VITE_FORMS_URL`.
- `apps/landing/.gitignore` (or root `.gitignore`) — ignore the
  generated manifest.
- `apps/landing/src/lib/frontmatter.ts` — extend schema with
  `form_id?: string`.
- `apps/landing/src/components/MarkdownContent.tsx` — replace registry
  resolver with manifest + frontmatter context, drop `urlTransform`
  and `form:` scheme.
- 11× `apps/landing/src/content/<slug>/start.md` — add `form_id`
  frontmatter; drop `href="form:..."` from the `<a data-start-link>`.
- `apps/landing/src/content/apply-to-the-barbados-youthadvance-corps.md`
  — remove the Start now anchor entirely (no API form).
- `apps/landing/src/content/register-summer-camp.md` — add `form_id`
  frontmatter; drop `href`.

**Deleted**

- `apps/landing/src/content/form-ids.ts`

## Verify

- `pnpm exec nx lint landing` clean.
- `pnpm exec nx test landing` 36/36 still passing (add tests for the
  manifest-fetch script and the anchor renderer if existing patterns
  warrant it; the project's bar is utility-level tests only, so likely
  one test for the script).
- `pnpm exec nx dev landing` — confirm `predev` writes the manifest;
  visit each updated start page, confirm Start now renders and points
  at `${VITE_FORMS_URL}/forms/<form_id>`.
- Visit `/work-employment/apply-to-the-barbados-youthadvance-corps` —
  confirm **no** Start now button (form removed from API).
- Set `VITE_FORMS_API_URL` to a bogus URL and run prebuild — confirm
  the script errors with a clear message and the build does not
  proceed.
- Hover any Start now button: status bar shows the resolved forms-app
  URL on the configured `VITE_FORMS_URL` host.
- Umami events fire as `<form_id>-start`.

## Out of scope (deferred)

- **Pages with no matching API form.** `calculate-severance-pay/start.md`,
  `get-a-primary-school-textbook-grant/start.md`, and any currently-pointing
  CTAs on `crop-over-permits/index.md`,
  `request-a-presidential-visit-for-a-centenarian/index.md`,
  `calculate-your-pension/index.md` — no API form. Leave existing
  buttons alone; once a form exists, add `form_id` frontmatter.
- **Renewal forms.** `driver-licence-renewal` and `passport-renewal`
  exist in the API but the matching landing pages are about
  _applying_, not renewing. No `form_id` added until dedicated renewal
  pages exist.
- **Missing landing pages for available forms.** `request-fire-inspection`,
  `reserve-society-name`, `school-registration-fee`,
  `national-id-application`, `digital-media-training-programme-application`,
  `youth-cultural-training-registration-2025`,
  `ydp-performing-arts-registration-2025-2026`,
  `youth-leadership-workshop-registration-2026`,
  `pathways-employability-programme-application-2026`,
  `project-dawn-application`. Content-authoring work; tracked
  separately.

## Decision record

- **ADR 0004** (registry in one file) gets marked **Superseded by 0005**.
  Its reasoning is correct for the moment in time it was written; the
  context changed when the forms API stabilised.
- **ADR 0005** (new) captures the principle this revision establishes:
  _Cross-app link availability is driven by a build-time fetch from the
  destination app's API. Content declares its target via frontmatter;
  authors do not maintain a parallel registry._

## Open questions / follow-ups

- **Production API URL.** Sandbox is
  `https://forms.api.sandbox.alpha.gov.bb`. Prod presumably
  `https://forms.api.alpha.gov.bb` — confirm once the domain is wired.
  Set `VITE_FORMS_API_URL` per environment in Amplify.
- **Prod forms-app URL.** `https://forms.sandbox.alpha.gov.bb` for
  sandbox builds; prod presumably `https://forms.alpha.gov.bb`. Set
  `VITE_FORMS_URL` per environment.
- **Build-time caching in CI.** If Amplify caches `node_modules` but
  not the source tree's generated files, every build runs the
  pre-build fetch. Verify this is the case and not a stale-cache
  source. Caching `available-forms.gen.ts` would be the bug.
- **What if the API returns a form we don't have a landing page for?**
  Currently nothing happens (orphaned formId in manifest). Worth
  surfacing on a maintainer dashboard or a content-team mailing list,
  but out of scope for this PR.
