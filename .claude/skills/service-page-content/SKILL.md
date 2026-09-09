---
name: service-page-content
description: Use when writing, rewriting, reviewing or restructuring a Government of Barbados service page on alpha.gov.bb — entry pages, start pages, combined service/start pages, and the copy the Form Builder's "Generate with AI" action produces. Use this whenever the user mentions a service page, start page, entry page, landing content, page copy or headings for a service, a licence or certificate page, a Start button, or asks to turn an MDA document, paper form, screenshot or rough draft into web content — even if they never say "start page".
---

# Service Page Content

Write and edit the markdown service pages in `apps/landing` the same way the content CMS's "Generate with AI" action does — guardrails first, then this repo's file, frontmatter and renderer conventions.

This skill covers the words on the page. It does not cover the form itself: for recipes, fields, steps and validation, use `form-design`.

## Step 1 — Read the guardrails BEFORE writing anything

**REQUIRED:** Read `apps/form_builder_api/src/ai/content-prompt.ts` before proposing or writing any page copy. Its `PROMPT_BODY` is the single live source of truth for page patterns, heading sequences, intro rules, GOV.UK list style, route lists, contact layout, reading age and the hard rules. All of it applies here.

If that file is missing or moved, STOP and tell the user — never write from memory. The rules change as content designers learn things, and a page written from a stale recollection is exactly the kind of drift the file exists to prevent.

Do not skip the read because the change "is just one heading". Most unaided mistakes are pattern violations on a small edit — for example adding a `## Payment` heading to a licence page, which that pattern does not have.

Three adaptations to the prompt's rules in this context:

| The prompt says                                            | In this skill                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| End the reply with a fenced ```json block of page fields   | Write a `.md` file with YAML frontmatter; the JSON output contract does not apply                      |
| You may receive the current page as JSON                   | Read the `.md` file from `apps/landing/src/content/` directly                                          |
| Single-shot, never ask questions                           | Conversational — ask the author when the source is genuinely ambiguous, but apply the rules yourself   |

The prompt tells you to flag missing information rather than invent it. Do that here too, in conversation — a fee, a deadline or a phone number that nobody confirmed is worse than an obvious gap, because a gap gets fixed and a plausible invention ships.

## Step 2 — File layout and frontmatter

Pages live in `apps/landing/src/content/`, as markdown with YAML frontmatter.

- **One combined page:** a flat file, `<slug>.md`.
- **Separate entry and start pages:** a directory, `<slug>/index.md` plus `<slug>/start.md`.

Which shape to use is a content decision, and the prompt's "Decide the page pattern first" section governs it — read that before creating files, because converting between the two later means moving files and re-pointing links.

Frontmatter is validated by `FrontmatterSchema` in `apps/landing/src/lib/frontmatter.ts`. Read it for the authoritative list; the fields that matter most day to day:

| Field                     | Notes                                                                          |
| ------------------------- | ------------------------------------------------------------------------------ |
| `title`                   | The page's H1 — the site renders it. Never repeat it as a heading in the body. |
| `description`             | Short summary for category listings and search, not part of the body           |
| `lede`                    | Optional grey intro line under the title                                       |
| `category`, `subcategory` | Slugs from `apps/landing/src/content/categories.ts`                            |
| `visibility`              | `public` \| `preview` \| `draft` — **defaults to `public` when omitted**       |
| `form_id`                 | Links the page to a form recipe; the editor wires the Start button from it     |
| `stage`, `publish_date`   | `stage` is `alpha`; `publish_date` is a date                                   |

Two things about `visibility` that catch people out:

- Omitting it does not make a page private. The schema defaults it to `public`. A page you meant to hold back ships live.
- `pageLevel()` in `apps/landing/src/content/registry.ts` walks ancestors and takes the **most restricted** level, so marking `<slug>/index.md` as `preview` automatically gates `<slug>/start.md` too. A runtime `service_status` overlay can also override any slug's level without a file change, so do not reason about visibility from frontmatter alone.

Neither `preview` nor `draft` is a confidentiality boundary — the content still ships in the client bundle. They are rollout gates. Do not use them to hide anything sensitive.

## Step 3 — The Start button and route lists

This is where hand-written pages break, because the markdown is rewritten at render time.

The Start button is a literal marker on its own line:

```markdown
<a data-start-link>Start now</a>
```

Use it at most once per page. With a `form_id` in frontmatter the destination is wired for you; an explicit `href` is only for pages that link elsewhere.

When a service has more than one route, `rehypeHideStartLinks` (`apps/landing/src/utils/markdown/plugins/hideStartLinks.ts`) hides the online route for a visitor who cannot see the page's `/start` sub-page, and counts the remaining routes down. That rewrite only stays coherent if you author the list the way it expects:

```markdown
## Complete the form

There are 2 ways to apply for a swimming pool licence. You can:

1. **Apply for a licence online**

   Allow about 5-10 minutes to complete the form.

   <a data-start-link>Start now</a>

2. **Get a paper application from the polyclinic**

   You must complete it by hand and submit the application to the polyclinic
   associated with the district where the pool is located.
```

- **Write the count as `2` or `two`, never `two (2)`.** The plugin matches `/are (\d+) ways|are ([a-zA-Z]+) ways/i`, and `two (2)` fails it — the count then never updates and the page contradicts its own list.
- **Keep the start link inside the online route's list item.** The plugin removes a whole `<li>`; a bare anchor is removed on its own while still decrementing the count, which leaves the route listed with no way to take it.
- **Keep the completion time inside that same list item.** "Allow about 5-10 minutes to complete the form." goes above the start link, not under a heading of its own — the licence pattern has no `## How long does it take?` section, and a time line left outside the item survives the rewrite that removes the route it describes.
- **Bold each route title, in sentence case, with no full stop.** These titles are the only bold text on the page, and the one place list items do not start in lowercase.
- **Keep the lead-in a plain paragraph.** The rewrite collapses it to a single text node, so links and bold inside it are lost.
- **One route means no list and no count** — just the completion time and the start link under the heading.

`apps/landing/src/content/apply-for-swimming-pool-licence.md` is the closest full page to copy from — it is the licence pattern end to end. One detail there has moved on: it writes its route titles as `###` sub-headings inside the list items, where new pages author them in bold. `apply-for-hotel-licence.md` and `apply-for-temporary-restaurant-permit/index.md` carry the same `###` shape.

## Step 4 — Verify

After writing or editing any page:

```bash
pnpm exec nx run landing:test
```

This covers the content registry, the frontmatter contract, and the markdown plugins that rewrite start links. Fix failures before presenting the work as done.

Do not run `landing:build` to check your work — its prebuild fetches from a live external forms API, so it fails offline for reasons that have nothing to do with your page. CI builds it.

## Common mistakes

| Mistake                                                              | Fix                                                                                    |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Writing the copy from memory of the house style                      | Read `content-prompt.ts` first — it is the live ruleset and it changes                  |
| `There are two (2) ways to…`                                         | `There are 2 ways to…` — the count rewrite cannot match the parenthesised form          |
| Start link sitting below the route list                              | Nest it inside the online route's list item so the whole route is removed together      |
| More than one `<a data-start-link>` on a page                        | One per page; the pattern decides where it goes                                         |
| Repeating the frontmatter `title` as an `#` or `##` heading          | The site renders the title; body headings start at `##`                                 |
| Omitting `visibility` expecting the page to stay hidden              | It defaults to `public` — set it explicitly                                             |
| Adding a `## Payment` heading to a licence page                      | That pattern folds payment method into `## Cost`                                        |
| A licence page headed `## How to apply for a …`                      | The heading is fixed wording: `## Complete the form`                                    |
| A `## How long does it take?` section on a licence page              | Put the completion time inside the online route's list item                             |
| `## Cost` placed above the route list on a licence page              | In this pattern `## Cost` sits after `## Complete the form`                             |
| Closing a licence page with `## Need assistance`                     | The help heading in this pattern is `## Contact`                                        |
| Mixing the certificate heading sequence with the licence one         | Pick one pattern per page                                                               |
| Inventing a fee, a processing time or a phone number to fill a gap   | Flag the gap to the author instead                                                      |
