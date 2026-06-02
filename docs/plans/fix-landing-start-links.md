# Plan — Fix landing "Start now" links for QA (issue #497)

**Status:** Draft for review
**Issue:** [#497](https://github.com/govtech-bb/gov-bb/issues/497)
**Scope of this session:** content/authoring fixes in `apps/landing` only. Deploy
mechanics (forcing a clean rebuild so the build-time manifest refreshes) are
handled outside this plan, on the deploy side.

## Goal

Make the "Start now" buttons on landing service pages render correctly so the QA
team can test the forms. Specifically, wire up the youth-and-community service
pages that have a matching live form, and make it unambiguous which remaining
pages are intentionally external vs. blocked on the forms team.

## Audit findings (root-cause summary)

The original #497 theory was "env vars unset/misconfigured." **That theory is now
ruled out.** The Amplify env vars were checked directly and verified live:

| Env | `VITE_FORMS_API_URL` | `VITE_FORMS_URL` | Verified |
| --- | --- | --- | --- |
| Sandbox | `https://forms.api.sandbox.alpha.gov.bb` | `https://forms.sandbox.alpha.gov.bb` | ✅ both HTTP 200 |
| Staging | `https://api.staging.alpha.gov.bb` | `https://forms.staging.alpha.gov.bb` | ✅ both HTTP 200 |

(Staging uses a different API host naming convention — `api.staging…` not
`forms.api.staging…`, which does not exist — but the configured value resolves
and returns valid `/form-definitions`, so it is correct, not a typo.)

With config ruled out, the missing/broken Start links fall into three causes:

1. **Build freshness** — sandbox forms exist live but the deployed build-time
   manifest predates them (`available-forms.gen.ts` is regenerated only when
   landing rebuilds, and nx may serve a cached build). Affects
   `get-death-certificate`, `post-office-redirection-business`,
   `post-office-redirection-deceased`. → fixed by a clean redeploy (deploy side).
2. **Authoring** — youth-and-community pages with a matching live form but no
   `form_id`/Start anchor. → this plan.
3. **Publication** — `post-office-redirection-individual` (not published) and
   `get-marriage-certificate` (live form is `get-marriage-certificate-test`). →
   forms-team follow-ups.

## Background (how a Start button renders)

A page only shows a "Start now" button when **both** of these are present
(`apps/landing/src/components/MarkdownContent.tsx`, ADR-0005):

1. `form_id: <id>` in the page's frontmatter, and
2. an `<a data-start-link>Start now</a>` anchor in the Markdown body.

At render time the `form_id` is checked against the build-time manifest
(`available-forms.gen.ts`, generated from the forms API). If the id is in the
manifest → button links to `${VITE_FORMS_URL}/forms/<id>`. If not → button is
silently suppressed.

The 20 `youth-and-community/**` pages currently have **neither** field. Instead
each has a commented-out `<!-- [Apply now](…/form) -->` placeholder and a live
"Go to the official site for …" external link — so today they deliberately send
users out to external sites. Matching `youth-opportunity-*` forms have since
gone live in sandbox, so the in-Alpha button can now be switched on.

## Approach

For each youth page that has a confidently-matching live form, add the two
required fields to render a "Start now" button, and **keep** the existing
"Go to the official site" external link (per decision: show both). Leave pages
with no matching Alpha form untouched and document them so QA doesn't flag them
as broken.

Alternatives considered:

- *Use the commented local `/form` route instead of `form_id`.* Rejected — those
  local routes don't exist for these programmes; the canonical mechanism per
  ADR-0005 is `form_id` against the forms app.
- *Wire up all 20 pages.* Rejected — only 13 have a confidently-matching live
  form; forcing a `form_id` on the other 7 would produce silently-suppressed
  buttons (the exact failure mode #497 is about).

## Scope

### In scope — wire up 13 youth pages (add `form_id` + Start anchor, keep external link)

| Page (`apps/landing/src/content/youth-and-community/…`) | `form_id` to add |
| --- | --- |
| `youth-development-leadership/byac.md` | `youth-opportunity-byac` |
| `youth-development-leadership/bridge-to-future-2025.md` | `youth-opportunity-bridge-to-future-2025` |
| `youth-development-leadership/bright-sparks-2.md` | `youth-opportunity-bright-sparks-2` |
| `youth-development-leadership/pathways.md` | `pathways-employability-programme-application-2026` |
| `youth-development-leadership/ydp.md` ⚠ | `ydp-performing-arts-registration-2025-2026` |
| `skills-trades-vocational-training/btu.md` | `youth-opportunity-btu` |
| `skills-trades-vocational-training/cap.md` | `youth-opportunity-cap` |
| `skills-trades-vocational-training/cip.md` | `youth-opportunity-cip` |
| `children-families-community/cmc.md` | `youth-opportunity-cmc` |
| `children-families-community/ceep.md` | `youth-opportunity-ceep` |
| `children-families-community/centre-access.md` | `youth-opportunity-centre-access` |
| `children-families-community/barbados-blooming-libraries.md` | `youth-opportunity-barbados-blooming-libraries` |
| `arts-culture/community-canvas.md` | `youth-opportunity-community-canvas` |

⚠ `ydp.md` — page is the broader "Youth Development Programme"; the only live YDP
form is specifically *performing-arts registration*. Confirm with the content
owner this is the right form before wiring (see Open questions).

Per-file edit (example, `byac.md`):

```diff
  category: youth-and-community
  subcategory: youth-development-leadership
  service_type: information
+ form_id: youth-opportunity-byac
  ---
  …
  ## How to apply

  Complete the short application form to register your interest. …

- <!-- [Apply now](https://alpha.gov.bb/youth-and-community/youth-development-leadership/byac/form) -->
+ <a data-start-link>Start now</a>

  ## More information

  [Go to the official site for Barbados YouthADVANCE Corps (BYAC)](https://…)   ← kept
```

### In scope — document the 7 intentionally-external pages

No code change; record in the plan / issue so QA treats them as expected, not
broken. None has a clearly-matching live Alpha form.

| Page | Current behaviour | Note |
| --- | --- | --- |
| `arts-culture/yar.md` | external link | no matching Alpha form |
| `entrepreneurship-business/yes.md` | external link | no matching Alpha form |
| `skills-trades-vocational-training/cyber-security-training.md` | external link | no matching Alpha form |
| `skills-trades-vocational-training/web-design-entrepreneurs.md` | external link | no matching Alpha form |
| `children-families-community/mission-barbados.md` | external link | no matching Alpha form |
| `children-families-community/spreading-joy-2025.md` | external link | no matching Alpha form |
| `children-families-community/national-summer-camp.md` | external link | matches `national-summer-camp-2025-registration`, but that form is already wired on `register-summer-camp.md` — possible duplicate page (flag, don't wire) |

### Out of scope — forms-team / publication follow-ups (not repo changes)

These render nothing today and **cannot** be fixed by content edits:

- `post-office-redirection-individual` — `form_id` is correct but the form is
  **not published** in sandbox. Needs the forms team to publish it.
- `get-marriage-certificate` — page declares `get-marriage-certificate`, but the
  live sandbox form is `get-marriage-certificate-**test**`. **Naming mismatch** —
  needs the forms team to publish under the real id (or confirm the intended id).

### Already-live, expected to fix on redeploy (QA re-verify)

`get-death-certificate`, `post-office-redirection-business`,
`post-office-redirection-deceased` are live in sandbox and their pages are
already authored correctly. They should light up once the manifest refreshes on
redeploy (handled on the deploy side). QA should re-check these after deploy.

## Files

- Modify (13): the youth-and-community `.md` files listed in the table above.
- No source/code files change in this plan.

## Verify

1. Run the landing build so the manifest regenerates from the live API:
   `pnpm exec nx run landing:build` (or `landing:dev`).
2. Confirm `apps/landing/src/content/available-forms.gen.ts` contains each
   `form_id` we added.
3. In dev, open each of the 13 pages and confirm: a "Start now" button renders,
   links to `${VITE_FORMS_URL}/forms/<form_id>`, **and** the "Go to the official
   site" link is still present.
4. Confirm the 7 unmapped pages are unchanged (external link only, no button).
5. `pnpm exec nx run-many -t build` and `-t test` green before pushing
   (per CLAUDE.md; exclude `landing` from offline builds if no network).

## Open questions

- `ydp.md` — is `ydp-performing-arts-registration-2025-2026` the correct form for
  the broader "Youth Development Programme" page, or should it stay external?
- `national-summer-camp.md` vs `register-summer-camp.md` — two pages for one
  form. Is the youth-and-community page a duplicate to retire, or should it point
  somewhere else?
- Should `service_type: information` change for the 13 wired pages now that they
  carry a transactional Start button? (Cosmetic/taxonomy — confirm with content.)
