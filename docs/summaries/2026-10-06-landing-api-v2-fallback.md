# landing reads pages from api_v2, falling back to static files (#2944)

## Context

`landing_v2` was removed from `v2-rewrite`. The content-as-data spike (#2698) now migrates `apps/landing` in place. Each page view asks api_v2 first, and anything api_v2 doesn't serve still comes from the markdown on disk. That lets pages move to the database one at a time.

## What we did

- `apps/landing/src/lib/api-v2-page.ts`:
  - `VITE_API_V2_URL`, optional and build-baked like `VITE_FORMS_API_URL`. When it is unset, landing is static only.
  - A server function that calls `GET /pages?url=` with a 5s timeout and `redirect: "manual"`.
  - `fromApiV2`, which turns the response into landing's `ContentPage` using the build's own `processMarkdown` and `bakeStartLinkFormId`.
- `$.tsx` loader: the api_v2 lookup goes where `findPage` used to run, after the category check. A hit sends its serialised page across the loader boundary; a static page still sends only its URL.
- Follow-ups: #2947 (sanitise HTML). #2950 (skip the lookup for subcategory URLs) was folded into #2952, and #2946's dates landed with #2959.

## Why we did it that way

- **Visibility gap, accepted.** The public api_v2 read 404s every non-public page, so landing can't tell "not migrated" from "hidden in v2". We chose not to change api_v2. A v2 404 always falls back to static, and a page that is hidden in v2 but still on disk follows its static visibility. Hiding a migrated page means changing both places, or deleting the `.md`.
- **A v2 hit is public.** The v1 `service_status` overlay never changes a v2 page's visibility, so the v1 `disabled` switch can no longer take down a page that api_v2 serves. v1 form-level state (closed, maintenance, `form_disabled`, the `/start` 404) still applies, because it describes the form rather than the page. The existing form block is shared in place; we didn't extract a helper.
- **Reuse `ContentPage`, not a new union type.** The issue sketched a `ResolvedPage` union. Mapping onto `ContentPage` minus `Component`/`selfRendered` left `PageView`, `MarkdownContent`, `head()` and the JSON-LD builders untouched.
- **No cache, 5s timeout.** The user chose no cache for now. Every page view costs one api_v2 call, and a hit also costs one markdown compile. The timeout is short because a fallback exists: a hung api_v2 (#2845) costs each view at most 5s, where 15s would add up towards Amplify's 28s SSR limit.
- **"Last updated"** first came from the static page at the same URL, because the public response had no dates. Once #2959 added `published_at` and `updated_at`, it comes from `published_at` (review on #2952), and the static lookup is gone. It deliberately isn't `updated_at`, which also changes on visibility-only edits. The seed copies each file's `publish_date` into `published_at`, so the dates shown didn't change.
- **Breadcrumbs stay registry-derived.** The API's `breadcrumbs` field is ignored, because every v2 page still has a static twin.

## What we almost got wrong

- **Parser in the client bundle.** A static `import { processMarkdown }` in the server-function module put remark/rehype (about 344 KB) into the client entry chunk. The server-fn compiler removes the handler, but Rollup keeps those side-effectful imports. Only grepping the production build caught it; tests and the typecheck can't. The fix is a dynamic `import()` inside `fromApiV2`, and the rule is recorded in [ADR 0076](../decisions/0076-server-function-modules-import-heavy-dependencies-lazily.md).
- **"Any error falls back" wasn't true at first.** The fetch caught its own errors, but compiling the markdown didn't. `componentDirectives` throws on a bad directive, which the build catches for static files and nothing caught for DB content, so one editor typo turned a page into an error page. Code review found it. `resolveApiV2Page` now treats a compile failure as a miss.
- **Frontmatter is a second unreviewed input.** `source_url` is rendered as a link and wasn't checked against `sanitizeUrls`, so the adapter now keeps it only if it is `http(s)`. That check wouldn't have come from the #2947 body pass.
- **#2947 is real.** In the local end-to-end check, a `<script>` written into a DB body came out as a working `<script>` element in the SSR HTML. `processMarkdown` passes raw HTML through, which was only acceptable while git review gated every body.

## Open questions

- Use the API breadcrumbs once v2-only pages exist?
- When to add caching, if profiling shows the per-view api_v2 call matters.
