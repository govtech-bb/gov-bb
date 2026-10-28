/**
 * Loads the live estate's categories and markdown pages — the snapshot in
 * `seed-data/estate.json` — with each new page's search chunks, and the data
 * collections in `seed-data/collections.ts` with their records. The database
 * records each insert in the history; nothing here names a user, so it is
 * recorded as `system`.
 *
 * Every insert is `on conflict do nothing`, so this is additive and
 * idempotent: it inserts what is missing and never overwrites what an author
 * has since changed. An early-return guard ("already seeded") would instead
 * mean a newly added page never reached a database seeded before it, silently.
 */

import { count, eq, sql, TransactionRollbackError } from "drizzle-orm";
import { writeSearchChunks } from "./adapters/postgres-pages";
import type { Database } from "./db";
import { chunkMarkdown } from "./modules/search-text";
import {
  categories,
  changeEvents,
  collectionRecords,
  contentPages,
  dataCollections,
} from "./schema";
import { ESTATE } from "./seed-data";
import { COLLECTIONS } from "./seed-data/collections";

export async function seed(db: Database): Promise<{
  categories: number;
  documents: number;
  collections: number;
  records: number;
}> {
  const counts = { categories: 0, documents: 0, collections: 0, records: 0 };

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

  for (const collection of COLLECTIONS) {
    const inserted = await db
      .insert(dataCollections)
      .values({
        key: collection.key,
        title: collection.title,
        recordKey: collection.record_key,
        schema: collection.schema,
      })
      .onConflictDoNothing()
      .returning({ id: dataCollections.id });
    counts.collections += inserted.length;
    for (const data of collection.records) {
      const record = await db
        .insert(collectionRecords)
        .values({
          collectionKey: collection.key,
          recordKey: data[collection.record_key]!,
          data,
        })
        .onConflictDoNothing()
        .returning({ id: collectionRecords.id });
      counts.records += record.length;
    }
  }

  return counts;
}

/** What a one-shot import wrote, or would have written on a dry run. */
export type ImportReport = {
  /** The markdown commit the estate snapshot was taken from. */
  source: string;
  /** Why existing content was replaced, or null when it was not. */
  reason: string | null;
  /** Rows `content_pages` held before the import. */
  existing: number;
  /** `change_events` actors and their row counts before the import. */
  actors: Record<string, number>;
  categories: number;
  documents: number;
  collections: number;
  records: number;
};

/**
 * Loads the estate once into a deployed database (#2978): one transaction
 * around `seed()`, so a failure leaves nothing behind. Refuses when
 * `content_pages` already has rows, because `seed()` is additive and would
 * bring back deleted pages without updating changed ones. `force` replaces
 * instead: the content tables, pending revisions included, are always
 * emptied first, in the same transaction, so history records each replaced
 * page and category as deleted, and the stated reason goes in the report.
 * History (`change_events`) is never emptied; it is append-only and the record of
 * what happened. `dryRun` does the real work and rolls it back.
 */
export async function importEstate(
  db: Database,
  options: { dryRun: boolean; force?: string },
): Promise<ImportReport> {
  let report!: ImportReport;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`lock table content_pages in share row exclusive mode`,
      );
      const [total] = await tx.select({ n: count() }).from(contentPages);
      const existing = total!.n;
      const actors: Record<string, number> = {};
      for (const row of await tx
        .select({ actor: changeEvents.actor, n: count() })
        .from(changeEvents)
        .groupBy(changeEvents.actor)) {
        actors[row.actor] = row.n;
      }
      if (existing > 0 && !options.force) {
        const histogram =
          Object.entries(actors)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([actor, n]) => `${actor}=${n}`)
            .join(", ") || "none";
        throw new Error(
          `content_pages has ${existing} rows (history actors: ${histogram}); refusing. Pass --force "<reason>" to replace them.`,
        );
      }
      if (options.force) {
        // `delete`, not `truncate`: truncate fires no row triggers, so the
        // replaced pages and categories would vanish from the history.
        await tx.execute(sql`delete from search_chunks`);
        await tx.execute(sql`delete from page_revisions`);
        await tx.execute(sql`delete from content_pages`);
        await tx.execute(sql`delete from categories`);
      }
      const counts = await seed(tx);
      report = {
        source: ESTATE.source,
        reason: options.force ?? null,
        existing,
        actors,
        ...counts,
      };
      if (options.dryRun) tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
  return report;
}
