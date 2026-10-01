/**
 * Loads the live estate's categories, forms and markdown pages — the
 * snapshot in `seed-data/estate.json`.
 *
 * Every insert is `on conflict do nothing`, so this is additive and
 * idempotent: it inserts what is missing and never overwrites what an author
 * has since changed. An early-return guard ("already seeded") would instead
 * mean a newly added page never reached a database seeded before it, silently.
 *
 * Pages go in through the same `compileMarkdown` as an editor's save, so a
 * seeded page's hast is exactly what a save of the same markdown would store.
 */

import { sql } from "drizzle-orm";
import { compileMarkdown } from "./markdown";
import { categories, contentPages, forms } from "./schema";
import { ESTATE } from "./seed-data";
import type { Database } from "./store";

export async function seed(db: Database): Promise<{
  categories: number;
  forms: number;
  documents: number;
}> {
  const counts = { categories: 0, forms: 0, documents: 0 };

  for (const category of ESTATE.categories) {
    const result = await db
      .insert(categories)
      .values(category)
      .onConflictDoNothing()
      .returning({ id: categories.id });
    counts.categories += result.length;
  }

  for (const form of ESTATE.forms) {
    const result = await db
      .insert(forms)
      .values({ formId: form.form_id, visibility: form.visibility })
      .onConflictDoNothing()
      .returning({ formId: forms.formId });
    counts.forms += result.length;
  }

  const categoryIds = new Map(
    (
      await db
        .select({ id: categories.id, slug: categories.slug })
        .from(categories)
    ).map((row) => [row.slug, row.id]),
  );

  for (const page of ESTATE.pages) {
    const published =
      page.visibility === "public"
        ? new Date(page.published_at ?? Date.now())
        : null;
    const result = await db
      .insert(contentPages)
      .values({
        url: page.url,
        slug: page.url.split("/").at(-1) ?? "",
        categoryId: page.category
          ? (categoryIds.get(page.category) ?? null)
          : null,
        title: page.title,
        description: page.description,
        visibility: page.visibility,
        formId: page.form_id,
        bodyMarkdown: page.body_markdown,
        hast: await compileMarkdown(page.body_markdown, page.form_id),
        frontmatter: page.frontmatter,
        publishedAt: published,
      })
      .onConflictDoNothing()
      .returning({ id: contentPages.id });
    counts.documents += result.length;
  }

  return counts;
}

/** True when the estate is empty, so boot can say something useful. */
export async function isEmpty(db: Database): Promise<boolean> {
  const result = (await db.execute(
    sql`select count(*)::int as count from content_pages`,
  )) as { rows?: Array<{ count: number }> } | Array<{ count: number }>;
  const rows = Array.isArray(result) ? result : (result.rows ?? []);
  return (rows[0]?.count ?? 0) === 0;
}
