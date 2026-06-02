# Import education service pages from newforms prototypes

Issue [#552](https://github.com/govtech-bb/gov-bb/issues/552) · plan `docs/plans/import-education-service-pages.md`

## Context

The `govtech-bb/newforms/Prototypes` directory holds 40 HTML form prototypes.
The ask was to surface a chosen set of these as landing-site **service detail
pages** under a new **Education** category. Going in, the landing site had no
education category and none of these services as content.

## What we did

- Added an `education` category to `apps/landing/src/content/categories.ts`.
- Authored **18 flat `.md` service pages** in `apps/landing/src/content/`, one
  per selected prototype, in GOV.bb house style.
- Each page: standard frontmatter (`stage: alpha`, `publish_date: 2026-06-02`,
  `category: education`) + a placeholder `<a data-start-link
  href="/education/<slug>/start">` button.

## Why we did it that way

- **These prototypes are *forms*, not content.** Each HTML file is a multi-page
  form definition. The landing `content/` files are *service detail* pages that
  describe a service and link to its form. So the work was synthesis — extract
  each prototype's intro/eligibility/guidance and rewrite it as a service page —
  not a mechanical HTML→MD conversion. This framing drove everything else.

- **Scope was narrowed by the user, not taken literally.** The original request
  said "add the files… category should be education." Most of the 40 prototypes
  aren't education (NIS, seniors, disaster, immigration), and three already
  exist as content. We stopped and let the user pick the list; they chose 18
  education-related ones. `temporary-teacher` was explicitly left untouched (it
  already lives in `work-employment`).

- **Single flat page, not `index.md` + `start.md`.** The folder pattern implies
  a live form route to step into. These forms don't exist in this repo yet, so
  the extra step page would add nothing. One info page per service was the
  lighter, honest shape.

- **Placeholder start links with no `form_id`.** `MarkdownContent.tsx` renders
  `<a data-start-link>` as a plain link button to its `href` when frontmatter
  has no `form_id` (the `form_id` path is gated on the build manifest). So a
  bare `/education/<slug>/start` link renders correctly and simply 404s until
  the forms are built — the intended interim state. The user chose this over
  linking out to the prototype or omitting the button. Relates to #497/#488.

- **Public, not preview.** We considered `visibility: preview` so dead start
  links wouldn't reach the public; the user chose fully public.

- **Authored via 4 parallel subagents** (one per theme: BSSEE, exams, schooling,
  grants/support) against a shared house-style spec, then a fifth review agent
  cross-checked all 18 against their source prototypes. Every concrete specific
  (phone numbers, fees, emails, deadlines) was verified present in the prototype
  — nothing fabricated, which matters for government content.

## What we almost got wrong

Three of the four authoring subagents wrote their files into the **main
checkout** rather than the worktree (path resolution from a relative/main-rooted
path). Caught it via `git status` showing only 4 of 18 new files; moved the 14
strays into the worktree and confirmed the main checkout was left clean. Worth
remembering: hand subagents the absolute worktree path *and* verify where files
actually landed.

## Open questions

- Three pages are **staff-facing, not citizen-facing** but sit in `education`
  per the user's explicit list: `apply-for-terms-leave` (teacher's leave),
  `claim-payment-for-examination-duties`, `claim-examination-travel-expenses`
  (exam staff). May want to recategorise under work/employment later.
- Start links 404 until the corresponding forms are built (#497/#488).
