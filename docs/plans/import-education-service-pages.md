# Import education service pages from newforms prototypes

**Issue:** [#552](https://github.com/govtech-bb/gov-bb/issues/552)

## Goal

Add 18 education-related government services to the landing site as GDS-style
service detail pages, grouped under a new **Education** category. Each page
describes the service (what it's for, who's eligible, how to apply) and links to
its online form — sourced from the form prototypes in
[`govtech-bb/newforms/Prototypes`](https://github.com/govtech-bb/newforms/tree/main/Prototypes).

## Approach

The Prototypes are multi-page **form definitions**, not landing content. The
markdown files under `apps/landing/src/content/` are **service detail pages**.
So this is not a mechanical HTML→MD conversion — it's synthesising a service
page from each prototype's intro heading and guidance text, rewritten in the
house style seen in existing pages (e.g.
`apply-for-a-position-as-a-temporary-teacher.md`).

**Page shape:** single flat `.md` per service (no `index.md`/`start.md`
folder). Frontmatter + prose, public, `category: education`.

**Form links:** each page carries a placeholder
`<a data-start-link href="/education/<slug>/start">…</a>` link. These 404 until
the forms are built (relates to #497/#488) — accepted for now.

Alternatives considered and rejected:
- *Folder with `index.md` + `start.md`* — implies a live form route; the forms
  don't exist in this repo yet, so the extra step page adds no value.
- *Forcing all 40 prototypes / all under `education`* — most of the other
  prototypes (NIS, seniors, disaster) aren't education; out of scope here.

## Scope

- Add an `education` category to `apps/landing/src/content/categories.ts` with a
  user-friendly description. No subcategories.
- Create **18** flat `.md` service pages under `apps/landing/src/content/`.
- For each: read the matching prototype, extract intro + guidance, write
  frontmatter (`title`, `description`, `stage: "alpha"`, `publish_date:
  2026-06-02`, `category: education`) and GDS-style body with a placeholder
  start link.
- Run the registry test + landing build to confirm frontmatter validates and
  the new category resolves.

**Excluded:** `temporary-teacher` — already exists as
`apply-for-a-position-as-a-temporary-teacher.md` under `work-employment`, left
unchanged.

## Files

### Modify
- `apps/landing/src/content/categories.ts` — add the `education` category entry.

### Add (18 — proposed slugs, finalised against each prototype)

| Prototype | Proposed file slug |
|---|---|
| `bssee-choice` | `choose-secondary-schools-for-the-bssee` |
| `bssee-defer` | `defer-your-childs-bssee-sitting` |
| `bssee-early-sitter` | `apply-to-sit-the-bssee-early` |
| `bssee-reallocation` | `request-a-bssee-school-reallocation` |
| `bssee-special-request` | `request-special-arrangements-for-the-bssee` |
| `non-nationals-entry` | `apply-for-secondary-school-entry-for-a-non-national-child` |
| `sixth-form-placement` | `apply-for-a-sixth-form-placement` |
| `home-schooling` | `apply-to-home-school-your-child` |
| `exemption-from-attendance` | `apply-for-exemption-from-school-attendance` |
| `terms-leave` | `apply-for-terms-leave` *(purpose to confirm)* |
| `uniform-grant` | `apply-for-a-school-uniform-grant` |
| `special-ed-bursary` | `apply-for-a-special-education-bursary` |
| `student-support-referral` | `refer-a-student-for-support` |
| `cape-private-registration` | `register-as-a-private-cape-candidate` |
| `csec-private-registration` | `register-as-a-private-csec-candidate` |
| `exam-results-statement` | `request-a-statement-of-examination-results` |
| `exam-duties-claim` | `claim-payment-for-examination-duties` *(purpose to confirm)* |
| `examination-travel` | `claim-examination-travel-expenses` *(purpose to confirm)* |

Slugs, titles and descriptions are **proposed** — confirmed by reading each
prototype during implementation.

## Verify

```bash
pnpm exec nx test landing       # registry.test.ts — frontmatter + category validation
pnpm exec nx build landing      # (excluded from offline run if network-gated; let CI build)
```

- Every new page validates against `FrontmatterSchema` and resolves to a
  `/education/<slug>` URL.
- The Education category appears in category listings with all 18 services.
- Spot-check 2–3 rendered pages for house-style prose and a working
  `data-start-link`.

## Open questions

- A few prototypes need their purpose confirmed from source before final
  title/slug/description: `terms-leave`, `exam-duties-claim`,
  `examination-travel` (claimant audience — teacher/invigilator vs parent).
- Education category **description** wording — draft in implementation, confirm
  with the human.
