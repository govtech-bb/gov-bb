/**
 * Content storage in PostgreSQL: every content query lives here.
 *
 * Rows become domain values on the way out. The database's own refusals
 * become `PageRejected`, and every other failure becomes
 * `ContentStoreUnavailable` with the driver's error kept only as its cause.
 * The hierarchy is `parent_id`; recursive reads carry Postgres's `cycle`
 * clause, so a loop that got into the data ends a read rather than hanging it.
 */

import {
  and,
  count,
  eq,
  inArray,
  isNull,
  max,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db";
import type { IndexedPage } from "../modules/estate-services";
import type { CategoryRecord, ListablePage } from "../modules/navigation";
import {
  ContentStoreUnavailable,
  PageRejected,
  type FieldError,
  type Frontmatter,
  type PageDocument,
  type PageId,
  type Visibility,
} from "../modules/page";
import type { Ancestor, ResolvablePage } from "../modules/page-visibility";
import { err, ok, type Result } from "../modules/result";
import type { SearchChunk } from "../modules/search-text";
import {
  categories,
  changeEvents,
  contentPages,
  searchChunks,
} from "../schema";
import type { EstateVersion, IndexReads } from "../services/editor-index";
import type {
  NewPageRecord,
  PageChange,
  PageRecords,
  PageRevision,
} from "../services/page-editing";
import type { PublicPageReads } from "../services/page-resolution";
import type { NavigationReads } from "../services/site-navigation";

type PageRow = typeof contentPages.$inferSelect;

const toDocument = (row: PageRow): PageDocument => ({
  id: row.id,
  url: row.url,
  slug: row.slug,
  category_id: row.categoryId,
  parent_id: row.parentId,
  title: row.title,
  description: row.description,
  visibility: row.visibility,
  form_id: row.formId,
  body_markdown: row.bodyMarkdown,
  frontmatter: row.frontmatter,
  published_at: row.publishedAt?.toISOString() ?? null,
  created_at: row.createdAt.toISOString(),
  updated_at: row.updatedAt.toISOString(),
});

/** The constraints a write can break, as the field an editor can fix. */
const REFUSALS: Readonly<Record<string, FieldError>> = {
  content_pages_category_id_fkey: {
    field: "category_id",
    message: "No category with that id.",
  },
  content_pages_parent_id_fkey: {
    field: "parent_id",
    message: "No page with that id.",
  },
  content_pages_parent_category_fkey: {
    field: "parent_id",
    message: "A sub-page must be in the same category as its parent page.",
  },
  content_pages_pkey: {
    field: "id",
    message: "Another page already has this id.",
  },
  content_pages_url_key: {
    field: "url",
    message: "Another page already has this url.",
  },
};

const HAS_SUB_PAGES: FieldError = {
  field: "id",
  message: "This page has sub-pages. Move or delete them before deleting it.",
};

/** Drizzle wraps the driver's error, so the SQLSTATE and constraint are on the cause. */
const violation = z.object({
  cause: z.object({
    code: z.string(),
    constraint: z.string().optional(),
  }),
});

function rejectionOf(error: unknown): PageRejected | null {
  const broken = violation.safeParse(error);
  const refusal = broken.success
    ? REFUSALS[broken.data.cause.constraint ?? ""]
    : undefined;
  return refusal ? new PageRejected([refusal]) : null;
}

/** A delete is refused only by a sub-page still pointing at the page. */
function refusedDelete(error: unknown): PageRejected | null {
  const broken = violation.safeParse(error);
  return broken.success && broken.data.cause.code === "23503"
    ? new PageRejected([HAS_SUB_PAGES])
    : null;
}

async function attempt<T, E extends Error = never>(
  operation: string,
  run: () => Promise<T>,
  refused: (error: unknown) => E | null = () => null,
): Promise<Result<T, E | ContentStoreUnavailable>> {
  try {
    return ok(await run());
  } catch (cause) {
    return err(refused(cause) ?? new ContentStoreUnavailable(operation, cause));
  }
}

/** `column in (…)` over the given visibilities, each one bound as a parameter. */
const visibilityIn = (column: SQL, visibilities: readonly Visibility[]) =>
  sql`${column} in (${sql.join(
    visibilities.map((visibility) => sql`${visibility}`),
    sql`, `,
  )})`;

/** Write a page's search chunks in place of whatever it had. */
export async function writeSearchChunks(
  db: Database,
  pageId: string,
  chunks: readonly SearchChunk[],
): Promise<void> {
  await db.delete(searchChunks).where(eq(searchChunks.pageId, pageId));
  if (chunks.length === 0) return;
  await db
    .insert(searchChunks)
    .values(chunks.map((chunk, ordinal) => ({ pageId, ordinal, ...chunk })));
}

/** Pages, categories, search text and the change log, in the content database. */
export class PostgresPages
  implements PublicPageReads, NavigationReads, PageRecords, IndexReads
{
  /** The root supplies the drizzle database over its shared pool. */
  constructor(private readonly db: Database) {}

  /** Run `work` in one transaction; an error result rolls back everything it wrote. */
  async atomically<R extends Result<unknown, Error>>(
    work: (records: PageRecords) => Promise<R>,
  ): Promise<R | Result<never, ContentStoreUnavailable>> {
    let refused: R | undefined;
    try {
      return await this.db.transaction(async (tx) => {
        const result = await work(new PostgresPages(tx));
        if (!result.ok) {
          refused = result;
          tx.rollback();
        }
        return result;
      });
    } catch (cause) {
      return refused ?? err(new ContentStoreUnavailable("transaction", cause));
    }
  }

  /** The page at this url, or null. */
  async pageAt(
    url: string,
  ): Promise<Result<ResolvablePage | null, ContentStoreUnavailable>> {
    const rows = await attempt("pageAt", () =>
      this.db.select().from(contentPages).where(eq(contentPages.url, url)),
    );
    return rows.ok ? ok(rows.value[0] ?? null) : rows;
  }

  /** The pages above this one, root first. */
  async ancestorsOf(
    pageId: PageId,
  ): Promise<Result<Ancestor[], ContentStoreUnavailable>> {
    const rows = await attempt("ancestorsOf", () =>
      this.db.execute<{
        url: string;
        title: string;
        visibility: Visibility;
      }>(sql`
        with recursive chain as (
          select id, parent_id, url, title, visibility, 0 as depth
            from content_pages where id = ${pageId}
          union all
          select p.id, p.parent_id, p.url, p.title, p.visibility, chain.depth + 1
            from content_pages p join chain on p.id = chain.parent_id
        ) cycle id set is_cycle using path
        select url, title, visibility from chain
          where not is_cycle order by depth desc`),
    );
    return rows.ok ? ok(rows.value.rows) : rows;
  }

  /** The visibility of a page's `start` sub-page, or null when it has none. */
  async startStepVisibility(
    pageId: PageId,
  ): Promise<Result<Visibility | null, ContentStoreUnavailable>> {
    const rows = await attempt("startStepVisibility", () =>
      this.db
        .select({ visibility: contentPages.visibility })
        .from(contentPages)
        .where(
          and(
            eq(contentPages.parentId, pageId),
            eq(contentPages.slug, "start"),
          ),
        ),
    );
    return rows.ok ? ok(rows.value[0]?.visibility ?? null) : rows;
  }

  /** Every category, in the order the site lists them. */
  categories(): Promise<Result<CategoryRecord[], ContentStoreUnavailable>> {
    return attempt("categories", () =>
      this.db
        .select({
          id: categories.id,
          slug: categories.slug,
          title: categories.title,
          description: categories.description,
          parentId: categories.parentId,
        })
        .from(categories)
        .orderBy(categories.position, categories.title),
    );
  }

  /** The url of every page with this slug. */
  async urlsWithSlug(
    slug: string,
  ): Promise<Result<string[], ContentStoreUnavailable>> {
    const rows = await attempt("urlsWithSlug", () =>
      this.db
        .select({ url: contentPages.url })
        .from(contentPages)
        .where(eq(contentPages.slug, slug)),
    );
    return rows.ok ? ok(rows.value.map((row) => row.url)) : rows;
  }

  /** The categories with at least one page of these visibilities at their root. */
  async listingCategoryIds(
    visibilities: readonly Visibility[],
  ): Promise<Result<Set<string>, ContentStoreUnavailable>> {
    const rows = await attempt("listingCategoryIds", () =>
      this.db
        .selectDistinct({ categoryId: contentPages.categoryId })
        .from(contentPages)
        .where(
          and(
            isNull(contentPages.parentId),
            inArray(contentPages.visibility, [...visibilities]),
          ),
        ),
    );
    return rows.ok
      ? ok(new Set(rows.value.flatMap((row) => row.categoryId ?? [])))
      : rows;
  }

  /** The pages of these visibilities at a category's root. */
  rootPagesIn(
    categoryId: string,
    visibilities: readonly Visibility[],
  ): Promise<Result<ListablePage[], ContentStoreUnavailable>> {
    return attempt("rootPagesIn", () =>
      this.db
        .select({
          id: contentPages.id,
          parentId: contentPages.parentId,
          slug: contentPages.slug,
          url: contentPages.url,
          title: contentPages.title,
          description: contentPages.description,
          formId: contentPages.formId,
          frontmatter: contentPages.frontmatter,
        })
        .from(contentPages)
        .where(
          and(
            eq(contentPages.categoryId, categoryId),
            isNull(contentPages.parentId),
            inArray(contentPages.visibility, [...visibilities]),
          ),
        ),
    );
  }

  /** Every page of these visibilities beneath only pages of them. */
  async visiblePages(
    visibilities: readonly Visibility[],
  ): Promise<Result<ListablePage[], ContentStoreUnavailable>> {
    const rows = await attempt("visiblePages", () =>
      this.db.execute<{
        id: PageId;
        parent_id: PageId | null;
        slug: string;
        url: string;
        title: string;
        description: string | null;
        form_id: string | null;
        frontmatter: Frontmatter;
      }>(sql`
        with recursive visible as (
          select id, parent_id, slug, url, title, description, form_id, frontmatter
            from content_pages
            where parent_id is null
              and ${visibilityIn(sql.raw("visibility"), visibilities)}
          union all
          select p.id, p.parent_id, p.slug, p.url, p.title, p.description, p.form_id, p.frontmatter
            from content_pages p join visible v on p.parent_id = v.id
            where ${visibilityIn(sql.raw("p.visibility"), visibilities)}
        ) cycle id set is_cycle using path
        select id, parent_id, slug, url, title, description, form_id, frontmatter
          from visible where not is_cycle`),
    );
    if (!rows.ok) return rows;
    return ok(
      rows.value.rows.map((row) => ({
        id: row.id,
        parentId: row.parent_id,
        slug: row.slug,
        url: row.url,
        title: row.title,
        description: row.description,
        formId: row.form_id,
        frontmatter: row.frontmatter,
      })),
    );
  }

  /** These pages' search chunks, in order. */
  async searchChunksOf(
    pageIds: readonly string[],
  ): Promise<Result<Map<string, SearchChunk[]>, ContentStoreUnavailable>> {
    const rows = await attempt("searchChunksOf", () =>
      this.db
        .select({
          pageId: searchChunks.pageId,
          heading: searchChunks.heading,
          body: searchChunks.body,
        })
        .from(searchChunks)
        .where(inArray(searchChunks.pageId, [...pageIds]))
        .orderBy(searchChunks.pageId, searchChunks.ordinal),
    );
    if (!rows.ok) return rows;
    const byPage = new Map<string, SearchChunk[]>();
    for (const { pageId, heading, body } of rows.value) {
      byPage.set(pageId, [...(byPage.get(pageId) ?? []), { heading, body }]);
    }
    return ok(byPage);
  }

  /** The page with this id, or null. */
  async find(
    id: PageId,
  ): Promise<Result<PageDocument | null, ContentStoreUnavailable>> {
    const rows = await attempt("find", () =>
      this.db.select().from(contentPages).where(eq(contentPages.id, id)),
    );
    return rows.ok ? ok(firstDocument(rows.value)) : rows;
  }

  /** The page with this id, its row locked until the transaction ends, or null. */
  async lock(
    id: PageId,
  ): Promise<Result<PageDocument | null, ContentStoreUnavailable>> {
    const rows = await attempt("lock", () =>
      this.db
        .select()
        .from(contentPages)
        .where(eq(contentPages.id, id))
        .for("update"),
    );
    return rows.ok ? ok(firstDocument(rows.value)) : rows;
  }

  /** A transaction-scoped lock every hierarchy change takes before its loop check. */
  async holdHierarchy(): Promise<Result<void, ContentStoreUnavailable>> {
    const held = await attempt("holdHierarchy", () =>
      this.db.execute(
        sql`select pg_advisory_xact_lock(hashtext('content_pages.parent_id'))`,
      ),
    );
    return held.ok ? ok(undefined) : held;
  }

  /** The ids of the pages above this one, the page itself included. */
  async ancestorIds(
    pageId: PageId,
  ): Promise<Result<string[], ContentStoreUnavailable>> {
    const rows = await attempt("ancestorIds", () =>
      this.db.execute<{ id: string }>(sql`
        with recursive chain as (
          select id, parent_id from content_pages where id = ${pageId}
          union all
          select p.id, p.parent_id from content_pages p
            join chain on p.id = chain.parent_id
        ) cycle id set is_cycle using path
        select id from chain`),
    );
    return rows.ok ? ok(rows.value.rows.map((row) => row.id)) : rows;
  }

  /** A page's category, or null when it has none or there is no such page. */
  async categoryOf(
    pageId: PageId,
  ): Promise<Result<string | null, ContentStoreUnavailable>> {
    const rows = await attempt("categoryOf", () =>
      this.db
        .select({ categoryId: contentPages.categoryId })
        .from(contentPages)
        .where(eq(contentPages.id, pageId)),
    );
    return rows.ok ? ok(rows.value[0]?.categoryId ?? null) : rows;
  }

  /** Insert a page; the database refuses an unknown category or parent, a mismatched category, and a taken url or id. */
  async insert(
    page: NewPageRecord,
  ): Promise<Result<PageDocument, PageRejected | ContentStoreUnavailable>> {
    const rows = await attempt(
      "insert",
      () =>
        this.db
          .insert(contentPages)
          .values({
            ...(page.id ? { id: page.id } : {}),
            ...page.values,
            publishedAt: page.publishedAt,
          })
          .returning(),
      rejectionOf,
    );
    return rows.ok ? ok(onlyDocument(rows.value)) : rows;
  }

  /** Overwrite a page that exists; the database refuses what an insert would. */
  async replace(
    id: PageId,
    page: PageRevision,
  ): Promise<Result<PageDocument, PageRejected | ContentStoreUnavailable>> {
    const rows = await attempt(
      "replace",
      () =>
        this.db
          .update(contentPages)
          .set({
            ...page.values,
            updatedAt: page.updatedAt,
            publishedAt: page.publishedAt,
          })
          .where(eq(contentPages.id, id))
          .returning(),
      rejectionOf,
    );
    return rows.ok ? ok(onlyDocument(rows.value)) : rows;
  }

  /**
   * File a page's uncategorised sub-pages, all the way down, under its
   * category. `on update cascade` moves sub-pages that had the parent's old
   * category, but the composite key skips a row whose category is null, so a
   * parent that gains its first category would otherwise leave them behind.
   */
  async fileUncategorisedBelow(
    id: PageId,
    categoryId: string,
  ): Promise<Result<void, ContentStoreUnavailable>> {
    const filed = await attempt("fileUncategorisedBelow", () =>
      this.db.execute(sql`
        with recursive below as (
          select id from content_pages where parent_id = ${id}
          union all
          select p.id from content_pages p join below b on p.parent_id = b.id
        ) cycle id set is_cycle using path
        update content_pages set category_id = ${categoryId}
          where category_id is null
            and id in (select id from below where not is_cycle)`),
    );
    return filed.ok ? ok(undefined) : filed;
  }

  /** Replace a page's search chunks. */
  replaceSearchChunks(
    pageId: PageId,
    chunks: readonly SearchChunk[],
  ): Promise<Result<void, ContentStoreUnavailable>> {
    return attempt("replaceSearchChunks", () =>
      writeSearchChunks(this.db, pageId, chunks),
    );
  }

  /** Delete a page, returning it as it stood, or null when there was none; one with sub-pages is refused. */
  async remove(
    id: PageId,
  ): Promise<
    Result<PageDocument | null, PageRejected | ContentStoreUnavailable>
  > {
    const rows = await attempt(
      "remove",
      () =>
        this.db.delete(contentPages).where(eq(contentPages.id, id)).returning(),
      refusedDelete,
    );
    return rows.ok ? ok(firstDocument(rows.value)) : rows;
  }

  /** Append an entry to the change log, numbered after the page's last. */
  appendChange(
    change: PageChange,
  ): Promise<Result<void, ContentStoreUnavailable>> {
    return attempt("appendChange", async () => {
      const [next] = await this.db
        .select({
          versionNo: sql<number>`coalesce(max(${changeEvents.versionNo}), 0) + 1`,
        })
        .from(changeEvents)
        .where(
          and(
            eq(changeEvents.entityKind, "content_page"),
            eq(changeEvents.entityId, change.page.id),
          ),
        );
      await this.db.insert(changeEvents).values({
        entityKind: "content_page",
        entityId: change.page.id,
        versionNo: Number(next?.versionNo ?? 1),
        action: change.action,
        actor: change.actorId,
        snapshot: change.page,
      });
    });
  }

  /** Every page with its category, for the service index. */
  async indexedPages(): Promise<
    Result<IndexedPage[], ContentStoreUnavailable>
  > {
    const rows = await attempt("indexedPages", () =>
      this.db
        .select({
          id: contentPages.id,
          parentId: contentPages.parentId,
          slug: contentPages.slug,
          url: contentPages.url,
          title: contentPages.title,
          visibility: contentPages.visibility,
          formId: contentPages.formId,
          updatedAt: contentPages.updatedAt,
          categorySlug: categories.slug,
          categoryTitle: categories.title,
        })
        .from(contentPages)
        .leftJoin(categories, eq(contentPages.categoryId, categories.id)),
    );
    if (!rows.ok) return rows;
    return ok(
      rows.value.map(({ categorySlug, categoryTitle, ...page }) => ({
        ...page,
        category:
          categorySlug && categoryTitle
            ? { slug: categorySlug, title: categoryTitle }
            : null,
      })),
    );
  }

  /** The change log's size and newest timestamp. */
  changeLogVersion(): Promise<Result<EstateVersion, ContentStoreUnavailable>> {
    return attempt("changeLogVersion", async () => {
      const [row] = await this.db
        .select({ count: count(), latest: max(changeEvents.occurredAt) })
        .from(changeEvents);
      return {
        count: row?.count ?? 0,
        latest: row?.latest?.toISOString() ?? null,
      };
    });
  }
}

function firstDocument(rows: readonly PageRow[]): PageDocument | null {
  const [row] = rows;
  return row ? toDocument(row) : null;
}

/** A write's `returning()` always yields the row it wrote. */
function onlyDocument(rows: readonly PageRow[]): PageDocument {
  const [row] = rows;
  if (!row) throw new Error("Postgres returned no row for a write");
  return toDocument(row);
}
