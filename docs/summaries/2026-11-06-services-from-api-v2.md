# api v1 `GET /services` reads api_v2's catalog (#3249)

## Context

api v1's `GET /services` served a compiled snapshot of the landing markdown,
with visibility overlaid from `service_status`. After cutover, pages are
published in editor_v2 and the markdown stops being the source, so the
snapshot would go stale with every publish. #3540 had already extended
api_v2's `GET /catalog` with `slug`, `category`, `form_id` and `visibility`,
and #3250 (#3598) had built the form → category lookup on
`ContentService.index()`.

## What we did

- `ContentService.index()` reads `${API_V2_URL}/catalog` when the variable is
  set, sending `RECIPE_PREVIEW_TOKEN` as `x-preview-token`. One in-memory cache
  of 60 s holds public and preview pages together; `list()` filters per request.
- `index()` and `categoryForForm()` became async in both modes.
- `API_V2_URL` is declared in env validation, `.env.example` and `SPEC.md`; one
  bullet under ADR 0110 "After cutover".

## Why we did it that way

- **Runtime read behind an env var, static path kept.** A regenerated snapshot
  pointed at api_v2 would still need a commit and a deploy per publish. Having
  consumers call api_v2 directly would take two more deploys, plus the secret
  in each. Staging and prod have no api_v2 until their cutover windows, so the
  static path stays as their behaviour, and as everyone's rollback (unset the
  variable). It is deleted in #3545.
- **The preview token on the read (user's call).** A public-only read would
  drop preview pages, and with them the category of pre-launch forms that only
  preview pages link to (#3250). The token is the one v1 already holds, so no
  new secret is needed. Its equality with api_v2's `PREVIEW_SECRET` is runbook
  policy (#3367), so a 401 is logged as a configuration error.
- **`service_status` ignored in api_v2 mode.** ADR 0110 already made
  `content_pages.visibility` the only page switch after cutover. The
  fail-closed "no row → preview" rule would also hide every page created in
  editor_v2, which is exactly what this issue is meant to make visible.
- **Slug rule (leaf, or the full path past two segments).** feature_flagging
  builds `category/slug` for a slug with no slash, and nothing redirects a wrong
  two-segment path. Leaf-only slugs would therefore 404 the admin link for every
  subcategory page. Marked `ponytail:` until consumers read a `url` field.
- **503 on a cold failure, not the snapshot.** Falling back to the snapshot
  would bring back pages unpublished in editor_v2 and hide the outage. Both
  consumers already treat a non-2xx as an empty list.

## What we almost got wrong

- The plan assumed #3250's category lookup would see a cold failure as "no
  category". In fact `categoryForForm()` awaited the same throwing read, so an
  api_v2 outage would have 503'd every `GET /form-definitions/:formId`. The PR
  review caught it. The lookup now degrades to `undefined`, and a stale catalog
  is served while one shared refresh runs, so form loads never wait on api_v2.

- An empty re-check against sandbox looked like a regression. The cause was
  nest `--watch` restarting just after the readiness probe answered, so curl got
  no response. A second run matched the first: 35 public pages and 93 for an
  admin.
- `editor_v2:build` fails locally while prerendering (two `@tanstack/router-core`
  versions in the store). This change doesn't touch it, and CI on `v2-rewrite`
  was green.

## Open questions

- Sandbox api_v2 lacks 18 pages the snapshot lists (7 About Barbados and 11
  education pages). They need an import before sandbox gets `API_V2_URL`. Until
  then the three-segment About Barbados slugs are proven by unit test only.
- The switch-on (alpha-infra#801) waits for that import, for #3256 (the 3
  code-route services) and for #3131, since api v1 deploys from `main`.
