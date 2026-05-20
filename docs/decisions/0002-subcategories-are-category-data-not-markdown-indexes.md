# 0002 — Sub-categories are category data, not markdown indexes

**Date:** 2026-05-20
**Status:** Accepted

## Context

The landing content registry (`apps/landing/src/content/`) started with a flat category model: a small list of `Category` records in `categories.ts`, and pages claiming category membership via frontmatter. Every category index page (`/<category>`) was rendered from the registry by filtering pages whose frontmatter claimed that slug.

Mirroring alpha.gov.bb's `youth-and-community` category surfaced a need for one extra level of grouping — sub-categories, each with their own slug, title and intro paragraph, holding a subset of the pages under a category. Two routes were available:

1. **Data on the parent.** Extend the `Category` interface with an optional `subcategories: SubCategory[]` array (slug, title, description). Pages declare their sub-category via a `subcategory` frontmatter field. Sub-category index pages are rendered from this data by the same catch-all route that handles categories and leaf pages.
2. **Markdown indexes.** Create an `index.md` per sub-category (e.g. `youth-and-community/<subcat>/index.md`) carrying the sub-category's title and intro, with leaf pages sitting alongside. The registry treats sub-category indexes as a special kind of page.

Route 2 is symmetric with how multi-step pages work today (`apply-for-conductor-licence/index.md` + `apply-for-conductor-licence/start.md`). It's also how some other content systems model hierarchy.

## Decision

**Hierarchical category groupings live as typed data on the parent `Category` object, not as markdown index files.**

Concretely:

- `Category` carries an optional `subcategories: Array<SubCategory>`. Each `SubCategory` has `slug`, `title`, and optional `description` (the intro paragraph shown on the sub-category index page).
- Pages declare sub-category membership via an optional `subcategory: string` field in frontmatter. The registry validates at module load that the value matches a sub-category declared by one of the page's categories — invalid combinations throw with a clear message.
- Sub-category index pages (`/<category>/<subcat>`) are rendered by the catch-all route directly from `Category.subcategories[i]`. No markdown file backs them.
- Leaf pages live at `/<category>/<subcat>/<leaf>`. The registry constructs this 3-segment URL from frontmatter; file-system nesting under `content/<category>/<subcat>/` is permitted but optional, and the registry strips the redundant directory prefix when present.

## Consequences

- **One source of truth for taxonomy shape.** All categories and sub-categories are visible in `categories.ts` — no hunting through directories to discover the structure. Adding a sub-category is a typed edit, not a file-system convention.
- **Validation at boundary, not in content.** Page–sub-category relationships are checked at registry load. A typo in `subcategory:` fails the build with a pointer to the page slug, instead of silently producing a 404 or a page that no index lists.
- **Sub-category copy is type-checked.** Titles and descriptions are strings in TypeScript and benefit from refactor tooling. They can't develop frontmatter drift (e.g. mixed `category:` shorthand vs `categories:` array) because there is no frontmatter to drift.
- **Markdown index files remain available for *multi-step pages*, not for hierarchy.** The `<slug>/index.md` + `<slug>/start.md` pattern still exists for pages whose flow needs more than one document. That is page-level structure, not taxonomy.
- **3-segment URLs are now first-class.** The catch-all route handles `<category>` (1 segment, may render a sub-category list), `<category>/<subcat>` (2 segments), and `<category>/<subcat>/<leaf>` (3 segments). Future taxonomy that needs more depth than this should re-open this decision rather than extend ad-hoc — at four segments the implicit model breaks down.
- **Future categories that need sub-categories follow this same pattern.** No special-casing of `youth-and-community`; the generic data model is the only model.
