/**
 * Loads the live estate's categories and markdown pages — the snapshot in
 * `seed-data/estate.json` — with each new page's search chunks and the first
 * entry in its history.
 *
 * Every insert is `on conflict do nothing`, so this is additive and
 * idempotent: it inserts what is missing and never overwrites what an author
 * has since changed. An early-return guard ("already seeded") would instead
 * mean a newly added page never reached a database seeded before it, silently.
 */

import { eq } from "drizzle-orm";
import {
  toDocument,
  writeChange,
  writeSearchChunks,
} from "./adapters/postgres-pages";
import type { Database } from "./db";
import { chunkMarkdown } from "./modules/search-text";
import { categories, contentPages } from "./schema";
import { ESTATE } from "./seed-data";

export async function seed(db: Database): Promise<{
  categories: number;
  documents: number;
}> {
  const counts = { categories: 0, documents: 0 };

  // The taxonomy lists a category before its subcategories.
  const categoryIds = new Map<string, string>();
  const idOf = async (slug: string) => {
    if (!categoryIds.has(slug)) {
      const [row] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, slug));
      if (row) categoryIds.set(slug, row.id);
    }
    return categoryIds.get(slug) ?? null;
  };
  for (const category of ESTATE.categories) {
    const result = await db
      .insert(categories)
      .values({
        slug: category.slug,
        title: category.title,
        description: category.description,
        position: category.position,
        parentId: category.parent ? await idOf(category.parent) : null,
      })
      .onConflictDoNothing()
      .returning({ id: categories.id });
    counts.categories += result.length;
  }

  // Parents before their sub-pages: each pass inserts the pages whose parent
  // is already in.
  const pageIds = new Map(
    (
      await db
        .select({ id: contentPages.id, url: contentPages.url })
        .from(contentPages)
    ).map((row) => [row.url, row.id]),
  );
  let pending = ESTATE.pages.filter((page) => !pageIds.has(page.url));
  while (pending.length > 0) {
    const ready = pending.filter(
      (page) => page.parent === null || pageIds.has(page.parent),
    );
    if (ready.length === 0) {
      throw new Error(
        `Seed pages with no parent in the estate: ${pending.map((page) => page.url).join(", ")}`,
      );
    }
    for (const page of ready) {
      const published =
        page.visibility === "public"
          ? new Date(page.published_at ?? Date.now())
          : null;
      const inserted = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(contentPages)
          .values({
            url: page.url,
            slug: page.url.split("/").at(-1) ?? "",
            categoryId: page.category ? await idOf(page.category) : null,
            parentId: page.parent ? pageIds.get(page.parent)! : null,
            title: page.title,
            description: page.description,
            visibility: page.visibility,
            formId: page.form_id,
            bodyMarkdown: page.body_markdown,
            frontmatter: page.frontmatter,
            publishedAt: published,
          })
          .onConflictDoNothing()
          .returning();
        if (row) {
          await writeSearchChunks(
            tx,
            row.id,
            chunkMarkdown(page.body_markdown),
          );
          await writeChange(tx, {
            page: toDocument(row),
            action: "created",
            actorId: "seed",
          });
        }
        return row;
      });
      if (inserted) {
        pageIds.set(page.url, inserted.id);
        counts.documents += 1;
      } else {
        // Another instance seeded it first; its children still need its id.
        const [existing] = await db
          .select({ id: contentPages.id })
          .from(contentPages)
          .where(eq(contentPages.url, page.url));
        if (existing) pageIds.set(page.url, existing.id);
      }
    }
    pending = pending.filter((page) => !ready.includes(page));
  }

  return counts;
}
