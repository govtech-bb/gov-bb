# Youth and Community: sub-categories + content

## Goal

Bring the `youth-and-community` category online in `apps/landing` with the same shape, sub-categories, URLs and content as [alpha.gov.bb/youth-and-community](https://alpha.gov.bb/youth-and-community). After this change, a visitor can land on `/youth-and-community`, choose one of five sub-categories, and reach 20 leaf service pages whose URLs match alpha exactly.

> **Scope:** This plan applies to `apps/landing` only.

## Approach

**Chosen:** Extend the existing category model with an optional `subcategories` array on `Category`, add an optional `subcategory` field to page frontmatter, and teach the catch-all route (`src/routes/$.tsx`) and the registry to construct and resolve 3-segment URLs of the form `/<category>/<subcategory>/<leaf>`. Sub-category titles + intros live as data on the `Category` definition — no separate markdown index files.

**Considered and rejected:**

- **Special-case `youth-and-community` in routing/registry.** Cheaper but sets a precedent that future categories with sub-categories will each need bespoke code. The generic model is a small amount of extra work today and free thereafter.
- **Flatten to 2-segment URLs locally.** Diverges from alpha.gov.bb. The user explicitly asked for URL parity so the public-facing structure feels coherent.
- **Stubs only with `source_url` to alpha; content in follow-up PRs.** Ships less in one go but leaves 20 placeholder pages in production. The user picked full content up-front.

## Scope

### Data model

- In `apps/landing/src/content/categories.ts`:
  - Add a `SubCategory` interface (`slug`, `title`, `description?`).
  - Extend `Category` with optional `subcategories?: SubCategory[]`.
  - Populate the existing `youth-and-community` entry with its 5 sub-categories (slugs, titles, intros taken from alpha — see Content below).
  - Export a lookup helper (`SUBCATEGORY_BY_SLUG` keyed by `category-slug/subcategory-slug`, or an equivalent `getSubcategory(catSlug, subSlug)` function) so the route loader and registry can resolve sub-categories without re-iterating.

### Frontmatter schema

- In `apps/landing/src/lib/frontmatter.ts`:
  - Add optional `subcategory: z.string()` to `FrontmatterSchema`.
  - Add `subcategory: string | undefined` to the resolved `Frontmatter` type.

### Registry

- In `apps/landing/src/content/registry.ts`:
  - When `subcategory` is set on a page, validate that at least one of the page's `categories` declares that sub-category. Throw at module load with a clear message otherwise (same pattern as the existing unknown-category check).
  - Canonical URL construction:
    - If `category` + `subcategory` are both set → `<category>/<subcategory>/<leaf>`
    - Else if `category` is set → `<category>/<leaf>` (existing behaviour)
    - Else → `<leaf>` (existing behaviour)
  - `leaf` = the slug with any leading `<category>/<subcategory>/` or `<category>/` directory prefix stripped, so files nested under `src/content/<category>/<subcategory>/` don't end up with doubled URL segments. Multi-step nested pages (e.g. `byac/start.md`) keep their trailing path.

### Routing

- In `apps/landing/src/routes/$.tsx`, expand the loader to recognise three URL shapes:
  1. **1 segment** — category index. If the matched category has `subcategories`, render the sub-category list (title + intro for each) instead of the flat page list. Otherwise: existing flat behaviour.
  2. **2 segments** — try page lookup first (preserves existing `category/page` URLs). If no page matches and `segments[0]` is a category-with-subcategories and `segments[1]` is one of its sub-category slugs, render the sub-category index (list of pages whose `subcategory` matches).
  3. **3 segments** — page lookup; 404 on miss.
- Add a `SubCategoryView` component (mirrors `CategoryView`) that takes the parent category, the sub-category, and the matching pages.
- Update the `head()` meta to set the appropriate title for sub-category views.

### Breadcrumbs

- `apps/landing/src/components/Breadcrumbs.tsx` already walks `pathname` segments and resolves each via `getCategoryTitle` / `getPageTitle`. Add a `getSubcategoryTitle(parentCatSlug, subSlug)` helper in the registry and call it from `titleForSegment` (when the segment isn't a category, page, or top-level match, try sub-category against the previous segment's category). This keeps 3-segment crumbs (`Home › Youth and Community › Arts and culture › Watch Community Canvas episodes`) intact.

### Home page

No change. `apps/landing/src/routes/index.tsx` already iterates `CATEGORIES` and links to `/<slug>`, which now lands on the sub-category index — the right behaviour.

### Content (20 new markdown files)

Files live under `apps/landing/src/content/youth-and-community/<subcategory-slug>/<leaf-slug>.md`. Frontmatter for each: `title`, `description`, `category: youth-and-community`, `subcategory: <slug>`, `source_url` pointing to the alpha page, `stage: alpha`, `publish_date`, `service_type` (`information` unless the page has a clear digital action, in which case `digital`). Body is the alpha page content converted to markdown.

Sub-categories and pages, mirroring alpha exactly:

**youth-development-leadership** — "Youth development and leadership" — _Long-term training, mentorship and leadership pathways for young people._
- `byac.md` — Apply to the Barbados Youth Advance Corps
- `ydp.md` — Join the Youth Development Programme
- `pathways.md` — Apply for the Pathways Employability Programme
- `bright-sparks-2.md` — Join Bright Sparks Educational Project 2.0
- `bridge-to-future-2025.md` — Register for the Bridge to the Future Workshop

**skills-trades-vocational-training** — "Skills, trades and vocational training" — _Practical courses and workshops in trades, technology and creative skills._
- `cip.md` — Register for the Community Impact Programme (CIP)
- `btu.md` — Apply for the Block Transformation Unit (Project Dawn)
- `cyber-security-training.md` — Join the Cyber Security Training Workshop
- `web-design-entrepreneurs.md` — Join Web Page Design and Maintenance for Entrepreneurs
- `cap.md` — Apply for the Community Arts Programme (CAP)

**entrepreneurship-business** — "Entrepreneurship and business" — _Support for young people starting and growing their own ventures._
- `yes.md` — Make first contact with the Youth Entrepreneurship Scheme (YES)

**arts-culture** — "Arts and culture" — _Creative programmes, performances and content celebrating Barbadian culture._
- `yar.md` — Register for Youth Achieving Results (YAR)
- `community-canvas.md` — Watch Community Canvas episodes

**children-families-community** — "Children, families and the wider community" — _Programmes, volunteering opportunities and services for children, families and neighbourhoods._
- `national-summer-camp.md` — Register a child for the National Summer Camp Programme
- `ceep.md` — Register for the Community Engagement and Educational Programme (CEEP)
- `mission-barbados.md` — Join Mission Barbados
- `barbados-blooming-libraries.md` — Donate books to Barbados is Blooming (Little Libraries)
- `cmc.md` — Volunteer for a Centre Management Committee (CMC)
- `spreading-joy-2025.md` — Find a Spreading Joy at Christmas motorcade near you
- `centre-access.md` — Book a community centre for an event

## Files

**Modify**
- `apps/landing/src/content/categories.ts` — `SubCategory` type, optional `subcategories` on `Category`, populated youth-and-community entry, lookup helper.
- `apps/landing/src/lib/frontmatter.ts` — optional `subcategory` field.
- `apps/landing/src/content/registry.ts` — sub-category validation, 3-segment URL construction, leaf-slug stripping, `getSubcategoryTitle` export.
- `apps/landing/src/routes/$.tsx` — 1/2/3-segment loader handling, sub-category index rendering.
- `apps/landing/src/components/Breadcrumbs.tsx` — resolve sub-category segments.

**Add (20 markdown files)** — see Content above.

## Verify

- `npm run dev:landing` and walk through:
  - `/youth-and-community` — shows 5 sub-categories with titles + intros.
  - `/youth-and-community/<each-subcat>` — shows the right page list, with titles matching alpha.
  - Every leaf URL resolves to a page with the alpha-sourced content.
  - Breadcrumbs read `Home › Youth and Community › <Subcat> › <Page>`.
  - Existing category URLs (e.g. `/travel-id-citizenship`, `/work-employment/register-for-community-sports-training-programme`) still work — no regression.
  - Unknown URLs under `/youth-and-community/...` still 404.
- `npx nx build landing` succeeds (registry validation runs at module load, so bad frontmatter would fail the build).
- `npx nx lint landing` clean.

## Branch and PR

- Branch off `dev`. Suggested name: `feat/youth-and-community-subcategories`.
- PR targets `dev` (per repo convention).
- PR description must include a section flagging the pre-existing local pages that overlap with alpha's youth-and-community content but are being **left in place** by this PR:
  - `apply-to-the-barbados-youthadvance-corps.md` (currently `work-employment`) — overlaps with new `youth-and-community/youth-development-leadership/byac.md`
  - `register-for-community-sports-training-programme/` (currently `work-employment`) — overlaps with new `youth-and-community/youth-development-leadership/ydp.md`
  - `register-summer-camp.md` — overlaps with new `youth-and-community/children-families-community/national-summer-camp.md`
  - `apply-to-volunteer-at-a-sports-camp.md` — adjacent (sports camp volunteering); review for overlap with future entries
  - `apply-to-jobstart-plus-programme/` — adjacent (employment pathway for young people)
  - `apply-to-be-a-project-protege-mentor/` — adjacent (mentorship)

  Note in the PR that consolidation is deferred to a follow-up.

## Open questions

- **Page-level `service_type`.** Most of the 20 alpha pages look like `information` (point of contact, eligibility, how-to). A couple may have inline forms or start-links — confirmed per-page when the content is converted.
- **`publish_date` on imported pages.** Set to today's date, or to the date the alpha page was published if visible during the conversion? Default: today, unless alpha clearly shows an earlier date.
- **Sub-category landing-page title format.** Use the alpha intro text verbatim as the page description, or rewrite to match the tone used in `categories.ts` entries? Default: verbatim from alpha.
