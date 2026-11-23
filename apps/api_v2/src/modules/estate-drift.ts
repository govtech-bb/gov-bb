/**
 * How the pages api_v2 serves differ from the estate snapshot (#3710). Pure,
 * so `check-import` and #3711's `sync-estate` share it.
 */

import { z } from "zod";
import type { SeedEstate } from "../seed-data";
import type { PublicPage } from "./page-visibility";

const FIELDS = [
  "body_markdown",
  "title",
  "description",
  "category",
  "subcategory",
  "form_id",
  "parent",
] as const;

const Text = z.string().nullable();

// A zod schema, so #3711's sync-estate can parse the --json file with it.
export const Difference = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("missing"), url: z.string() }),
  z.object({ kind: z.literal("extra"), url: z.string() }),
  z.object({
    kind: z.literal("field"),
    url: z.string(),
    field: z.enum(FIELDS),
    expected: Text,
    actual: Text,
  }),
]);
export type Difference = z.infer<typeof Difference>;

/**
 * `served`: each snapshot page read with the preview token, as the page or
 * null for a 404; a url it lacks was not read (a draft, or a failed read).
 * `listed`: every url /catalog lists with the token.
 *
 * Two rules come from how a page is served, not from any import transform:
 * an empty description is left out of the frontmatter, and there is no parent
 * field, so the parent is the crumb before the page, after the category crumbs.
 */
export function estateDifferences(
  estate: SeedEstate,
  served: ReadonlyMap<string, PublicPage | null>,
  listed: readonly string[],
): Difference[] {
  const categories = new Map(estate.categories.map((c) => [c.slug, c]));
  const differences: Difference[] = [];
  for (const page of estate.pages) {
    const got = served.get(page.url);
    if (got === undefined) continue;
    if (got === null) {
      differences.push({ kind: "missing", url: page.url });
      continue;
    }
    // The snapshot files a page under its subcategory when it has one.
    const filed = page.category ? categories.get(page.category) : undefined;
    const crumbs = (got.category ? 1 : 0) + (got.subcategory ? 1 : 0);
    const expected: Record<(typeof FIELDS)[number], string | null> = {
      body_markdown: page.body_markdown,
      title: page.title,
      description: page.description || null,
      category: filed ? (filed.parent ?? filed.slug) : null,
      subcategory: filed?.parent ? filed.slug : null,
      form_id: page.form_id,
      parent: page.parent,
    };
    const actual: Record<(typeof FIELDS)[number], string | null> = {
      body_markdown: got.body_markdown,
      title: got.frontmatter.title,
      description: got.frontmatter.description ?? null,
      category: got.category,
      subcategory: got.subcategory,
      form_id: got.form_id,
      parent: got.breadcrumbs.slice(crumbs, -1).at(-1)?.url ?? null,
    };
    for (const field of FIELDS) {
      if (expected[field] !== actual[field]) {
        differences.push({
          kind: "field",
          url: page.url,
          field,
          expected: expected[field],
          actual: actual[field],
        });
      }
    }
  }
  const known = new Set(estate.pages.map((page) => page.url));
  for (const url of listed) {
    if (!known.has(url)) differences.push({ kind: "extra", url });
  }
  return differences;
}
