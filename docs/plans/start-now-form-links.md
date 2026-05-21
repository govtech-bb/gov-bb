# Start now → forms-app links

**Status:** Delivered for in-scope services. Follow-ups tracked at the
bottom.

## Goal

Every "Start now" call-to-action on the landing app routes the user to the
real form in the forms app, for the services whose form is available in the
forms API. Form IDs live in one file so cutover work — sandbox to prod, or
to the upcoming "definitions in repo" model — is a single edit.

## Approach (delivered)

A small registry maps a stable **start-page slug** to a **formId**, and the
Markdown anchor handler resolves a custom `form:<slug>` href scheme.

- Registry: [`apps/landing/src/content/form-ids.ts`](../../apps/landing/src/content/form-ids.ts)

  ```ts
  const FORMS_BASE_URL =
    import.meta.env.VITE_FORMS_URL ?? "http://localhost:3000";

  export const FORM_IDS: Record<string, string> = {
    "get-birth-certificate": "get-birth-certificate-test",
    // …one entry per wired service
  };

  export function resolveFormHref(slug: string): string {
    const formId = FORM_IDS[slug];
    if (!formId) throw new Error(`Unknown form slug "${slug}"…`);
    return `${FORMS_BASE_URL}/forms/${formId}`;
  }
  ```

- Content authoring pattern (every wired `start.md` and the two single-file
  pages):
  ```markdown
  <a data-start-link href="form:get-birth-certificate">Start now</a>
  ```
- Resolution: the anchor handler in
  [`MarkdownContent.tsx`](../../apps/landing/src/components/MarkdownContent.tsx)
  rewrites `form:<slug>` hrefs to the resolved URL. Unknown slugs throw at
  render — caught immediately in dev and in any CI build/render path.
- ReactMarkdown's default URL sanitiser strips non-standard schemes, so a
  `urlTransform` was added that lets `form:` URLs through. Without it the
  href arrives at the component as `undefined` and the rendered link
  silently falls back to the page URL.

**Alternatives considered**

- _Inline `/forms/<formId>` strings in every `start.md`._ Simpler, no
  resolver, but every cutover means editing 13+ Markdown files. Rejected.
- _Env-keyed registry with both sandbox and prod IDs side by side, gated
  by an env var._ Avoids any code edit at cutover. Deferred because
  Isaiah's upcoming "definitions in repo" work will likely make the
  cutover trivial anyway (see _Open questions_).

## Scope delivered

- Added [`apps/landing/src/content/form-ids.ts`](../../apps/landing/src/content/form-ids.ts)
  with 13 mappings.
- Updated [`MarkdownContent.tsx`](../../apps/landing/src/components/MarkdownContent.tsx):
  anchor handler resolves `form:<slug>`; `StartLink` accepts an explicit
  `eventName` so per-service Umami analytics names (`<slug>-start`)
  survive the URL rewrite; added a `urlTransform` so the `form:` scheme
  isn't sanitised away.
- Documented the new env var in
  [`apps/landing/.env.example`](../../apps/landing/.env.example) —
  `VITE_FORMS_URL=https://forms.alpha.gov.bb`.
- Updated 11 `start.md` files and 2 single-file pages to use the
  `form:<slug>` href.
- Side-quest: fixed `GET /form-definitions/example-name-change` returning 500. The seed in [`apps/api/src/database/seed.ts`](../../apps/api/src/database/seed.ts)
  stored inline primitive fields but the endpoint hydrates through the
  registry, which expects `{ref, overrides?}` recipe shape. Rewrote the
  seed using `components/first-name` and `components/last-name` refs,
  bumped seed version to `1.0.1` so docker-compose re-seeds on next boot.

## In-scope mapping

| Start-page slug                                    | Form ID (sandbox)                         |
| -------------------------------------------------- | ----------------------------------------- |
| `apply-for-conductor-licence`                      | `apply-for-conductor-licence-test`        |
| `apply-to-be-a-project-protege-mentor`             | `project-protege-mentor-test`             |
| `apply-to-jobstart-plus-programme`                 | `jobstart-plus-programme-test`            |
| `apply-to-the-barbados-youthadvance-corps`         | `youthadvance-corps-recruitment`          |
| `get-birth-certificate`                            | `get-birth-certificate-test`              |
| `get-death-certificate`                            | `get-death-certificate-test`              |
| `get-marriage-certificate`                         | `get-marriage-certificate-test`           |
| `post-office-redirection-business`                 | `post-office-redirection-business-test`   |
| `post-office-redirection-deceased`                 | `post-office-redirection-deceased-test`   |
| `post-office-redirection-individual`               | `post-office-redirection-individual-test` |
| `register-for-community-sports-training-programme` | `community-sports-training-test`          |
| `register-summer-camp`                             | `national-summer-camp-2025-registration`  |
| `sell-goods-services-beach-park`                   | `sell-goods-services-beach-park-test`     |

## Files

**Added**

- `apps/landing/src/content/form-ids.ts`

**Modified**

- `apps/landing/src/components/MarkdownContent.tsx`
- `apps/landing/.env.example`
- `apps/landing/src/content/<slug>/start.md` × 11
- `apps/landing/src/content/apply-to-the-barbados-youthadvance-corps.md`
- `apps/landing/src/content/register-summer-camp.md`
- `apps/api/src/database/seed.ts`

## Verify

- `pnpm run dev:forms` (port 3000) and `pnpm run dev:api` (port 3001).
- `pnpm exec nx dev landing` (port 4200 by default), then visit each
  updated start page and click Start now. Confirm the forms app loads the
  right form.
- Hover a Start now button: the status-bar URL should be the resolved
  `${VITE_FORMS_URL}/forms/<formId>`, not the current page URL.
- `pnpm exec nx lint landing` clean. (`nx typecheck landing` has one
  pre-existing error in `content/registry.ts:58` unrelated to this work.)
- `curl http://localhost:3001/form-definitions/example-name-change` —
  should return `"status":"success"`, not 500.

## Out of scope (deferred)

- **Pages with no matching API form.** `calculate-severance-pay/start.md`
  and `get-a-primary-school-textbook-grant/start.md` still point to the
  old `/<category>/<slug>/form` path. Left alone until formIds exist —
  per Zainab's call.
- **Renewal forms.** `driver-licence-renewal` and `passport-renewal` exist
  in the API but the matching landing pages are about _applying_, not
  renewing. No CTA added until dedicated renewal pages exist.
- **Forms with no landing content yet.** `request-fire-inspection-test`,
  `reserve-society-name-test`, `school-registration-fee`,
  `national-id-application`, `digital-media-training-programme-application`,
  `youth-cultural-training-registration-2025`,
  `ydp-performing-arts-registration-2025-2026`,
  `youth-leadership-workshop-registration-2026`,
  `pathways-employability-programme-application-2026`,
  `project-dawn-application`. Per Harry, this is content authoring work
  that should ideally be done by non-devs through the form builder UI.

## Open questions / follow-ups (from lead review)

- **`forms.alpha.gov.bb` domain (Shannon).** Set
  `VITE_FORMS_URL=https://forms.alpha.gov.bb` in the Amplify console for
  the landing app once the domain is live. Code already supports it.
- **"Definitions in repo" change (Isaiah).** Form definitions are moving
  out of the database and into the repo as committed files. After that
  lands:
  - formIds become stable across environments → the sandbox `*-test`
    values in `FORM_IDS` will be replaced with the permanent IDs.
  - The api's `GET /form-definitions/*` endpoint may no longer be the
    runtime path for the forms app. Worth confirming whether the seed-bug
    fix above stays relevant or the endpoint gets removed entirely.
  - The "swap sandbox for prod IDs at cutover" reason behind the registry
    largely goes away, but the _slug → formId_ indirection is still
    useful as a content-authoring affordance.
- **Form builder needs its own deployment (Harry).** `apps/form_builder`
  must come out of the main deploy onto an internal-only subdomain,
  auth-gated, before non-devs use it to author the missing landing
  pages.
- **Renewal vs application pages.** Decide whether to add separate
  `renew-a-passport` / `renew-a-drivers-licence` landing pages keyed to
  the existing API forms, or fold them into the existing apply-for-\*
  pages with both options.
- **Pre-existing TS error** in
  [`apps/landing/src/content/registry.ts:58`](../../apps/landing/src/content/registry.ts:58)
  — unrelated to this work but blocks `nx typecheck landing`. Worth
  fixing or annotating in a separate PR.
