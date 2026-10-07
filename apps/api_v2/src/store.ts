/**
 * Every query lives here.
 *
 * Two audiences, two shapes. The site reads by url and by category, as the
 * public sees it or as a reviewer with the preview token does: the markdown,
 * what each category lists, and the text search indexes. The editor reads and
 * writes a `PageDocument` by id: every column.
 *
 * The hierarchy is `parent_id`, never the url: a page is as hidden as any
 * page above it, its breadcrumbs follow its parents, and a category lists
 * only the pages at its root. Form status is the forms API's, so nothing here
 * judges a form.
 *
 * The API serves the content and decides what may be seen; rendering the
 * markdown is the site's job.
 */

import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema";
import {
  categories,
  changeEvents,
  contentPages,
  searchChunks,
  type Frontmatter,
  type Visibility,
} from "./schema";
import { chunkMarkdown, type SearchChunk } from "./search-text";

/** The node-postgres drizzle handle, in production and under test. */
export type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

/** Who is reading: the public, or a reviewer holding the preview token. */
export type Viewer = "public" | "preview";

const VISIBLE_TO: Record<Viewer, Visibility[]> = {
  public: ["public"],
  preview: ["public", "preview"],
};

/** `column in (…)` for a viewer; the values are constants, never input. */
const visibleSql = (column: SQL, viewer: Viewer) =>
  sql`${column} in (${sql.raw(
    VISIBLE_TO[viewer].map((value) => `'${value}'`).join(", "),
  )})`;

/** A page as the editor reads and writes it. */
export interface PageDocument {
  id: string;
  url: string;
  slug: string;
  category_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  visibility: Visibility;
  form_id: string | null;
  body_markdown: string;
  frontmatter: Frontmatter;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** What the editor sends. The slug is derived from the url, never sent. */
export interface PageInput {
  id?: string;
  url: string;
  category_id?: string | null;
  parent_id?: string | null;
  title: string;
  description?: string | null;
  visibility?: Visibility;
  form_id?: string | null;
  body_markdown: string;
  frontmatter?: Frontmatter;
}

export interface Breadcrumb {
  name: string;
  url: string;
}

/**
 * A page as the site reads it. `frontmatter` carries the stored frontmatter
 * with the page's title and description put back, since those moved to
 * columns and the site still needs them for the heading and the meta tag.
 */
export interface PageResponse {
  url: string;
  frontmatter: Frontmatter & { title: string; description?: string };
  body_markdown: string;
  /** The form a href-less Start link in the markdown opens. */
  form_id: string | null;
  /** True when the page's `start` sub-page is hidden from this viewer. */
  hide_start_links: boolean;
  breadcrumbs: Breadcrumb[];
  /** When the page first went public; null until it has. */
  published_at: string | null;
  /** The page's last save. */
  updated_at: string;
}

/** A service as the editor's list shows it: its entry page and the pages below. */
export interface ServiceSummary {
  /** The entry page's id. */
  id: string;
  url: string;
  title: string;
  category: { slug: string; title: string };
  visibility: Visibility;
  /** The entry page's form, else its `/start` page's. */
  form_id: string | null;
  has_start_page: boolean;
  /** The entry page plus every page below it. */
  page_count: number;
  /** The latest change across those pages. */
  updated_at: string;
}

export type Resolution =
  | { kind: "page"; page: PageResponse }
  | { kind: "redirect"; url: string }
  | { kind: "not_found" };

/** A category as the site links to it. */
export interface CategoryRef {
  slug: string;
  url: string;
  title: string;
  description: string | null;
}

export interface CategoryNode extends CategoryRef {
  subcategories: CategoryRef[];
}

/** A page as a list shows it. */
export interface PageSummary {
  url: string;
  title: string;
  description: string | null;
  /** It has a form, or says it is a digital service. */
  digital: boolean;
}

export interface CategoryListing {
  category: CategoryRef;
  /** The category this one is a subcategory of, or null. */
  parent: CategoryRef | null;
  subcategories: CategoryRef[];
  /** The pages at the category's root, A to Z. */
  pages: PageSummary[];
}

export interface CatalogEntry extends PageSummary {
  stage: string | null;
}

export interface SearchDocument extends PageSummary {
  keywords: string[];
  /** The body as plain text, split at its headings, in order. */
  chunks: SearchChunk[];
}

/** `save` matched no row: someone else changed it first. */
export class ConflictError extends Error {
  constructor(readonly documentId: string) {
    super(
      "This page was changed somewhere else since you opened it. Reload to see the current version.",
    );
    this.name = "ConflictError";
  }
}

export interface ValidationError {
  field: string;
  message: string;
}

/** A write the database refused: an unknown category or parent, a taken url. */
export class ValidationFailedError extends Error {
  constructor(readonly errors: ValidationError[]) {
    super(`${errors.length} validation error(s)`);
    this.name = "ValidationFailedError";
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(what);
    this.name = "NotFoundError";
  }
}

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

const segmentsOf = (url: string) => url.split("/").filter(Boolean);

const isDigital = (formId: string | null, frontmatter: Frontmatter) =>
  formId !== null || frontmatter.service_type === "digital";

const byTitle = <T extends { title: string }>(a: T, b: T) =>
  a.title.localeCompare(b.title);

const FOREIGN_KEY_FIELDS: Record<string, ValidationError> = {
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
};

const driverCause = (error: unknown) =>
  (error as { cause?: { code?: string; constraint?: string } }).cause;

/**
 * The database's own refusals, as the 422 an editor can act on. Drizzle
 * wraps the driver's error, so the SQLSTATE is on the cause.
 */
function asValidationError(error: unknown): unknown {
  const cause = driverCause(error);
  const constraint = cause?.constraint ?? "";
  if (cause?.code === "23503" && FOREIGN_KEY_FIELDS[constraint]) {
    return new ValidationFailedError([FOREIGN_KEY_FIELDS[constraint]]);
  }
  if (cause?.code === "23505") {
    const field = constraint === "content_pages_pkey" ? "id" : "url";
    return new ValidationFailedError([
      { field, message: `Another page already has this ${field}.` },
    ]);
  }
  return error;
}

/** Replace a page's search chunks with ones cut from its current body. */
export async function writeSearchChunks(
  db: Executor,
  pageId: string,
  markdown: string,
): Promise<void> {
  await db.delete(searchChunks).where(eq(searchChunks.pageId, pageId));
  const chunks = chunkMarkdown(markdown);
  if (chunks.length === 0) return;
  await db
    .insert(searchChunks)
    .values(chunks.map((chunk, ordinal) => ({ pageId, ordinal, ...chunk })));
}

interface CategoryRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  parentId: string | null;
}

export class ApiStore {
  constructor(private readonly db: Database) {}

  /**
   * The site's read: the page at `url` if it and every page above it are
   * visible to `viewer`, flagged to hide its Start link when its `start`
   * sub-page is not.
   */
  async resolve(url: string, viewer: Viewer = "public"): Promise<Resolution> {
    const [page] = await this.db
      .select()
      .from(contentPages)
      .where(eq(contentPages.url, url));
    if (!page) return await this.redirectFor(url, viewer);

    const visible = VISIBLE_TO[viewer];
    const ancestors = await this.ancestorsOf(page.parentId);
    if (
      !visible.includes(page.visibility) ||
      ancestors.some((ancestor) => !visible.includes(ancestor.visibility))
    ) {
      return { kind: "not_found" };
    }

    const [start] = await this.db
      .select({ visibility: contentPages.visibility })
      .from(contentPages)
      .where(
        and(eq(contentPages.parentId, page.id), eq(contentPages.slug, "start")),
      );

    return {
      kind: "page",
      page: {
        url: page.url,
        frontmatter: {
          ...page.frontmatter,
          title: page.title,
          ...(page.description ? { description: page.description } : {}),
        },
        body_markdown: page.bodyMarkdown,
        form_id: page.formId,
        hide_start_links:
          start !== undefined && !visible.includes(start.visibility),
        breadcrumbs: [
          ...(await this.categoryCrumbs(page.categoryId)),
          ...ancestors.map((ancestor) => ({
            name: ancestor.title,
            url: ancestor.url,
          })),
          { name: page.title, url: page.url },
        ],
        published_at: page.publishedAt?.toISOString() ?? null,
        updated_at: page.updatedAt.toISOString(),
      },
    };
  }

  /** The pages above `parentId`, root first. */
  private async ancestorsOf(parentId: string | null) {
    if (parentId === null) return [];
    const { rows } = await this.db.execute<{
      url: string;
      title: string;
      visibility: Visibility;
    }>(sql`
      with recursive chain as (
        select id, parent_id, url, title, visibility, 0 as depth
          from content_pages where id = ${parentId}
        union all
        select p.id, p.parent_id, p.url, p.title, p.visibility, chain.depth + 1
          from content_pages p join chain on p.id = chain.parent_id
      ) cycle id set is_cycle using path
      select url, title, visibility from chain
        where not is_cycle order by depth desc`);
    return rows;
  }

  /** The page's category, and the category above it for a subcategory. */
  private async categoryCrumbs(categoryId: string | null) {
    if (categoryId === null) return [];
    const rows = await this.categoryRows();
    const category = rows.find((row) => row.id === categoryId);
    if (!category) return [];
    const parent = rows.find((row) => row.id === category.parentId);
    return [...(parent ? [parent] : []), category].map((row) => ({
      name: row.title,
      url: this.categoryUrl(row, rows),
    }));
  }

  /**
   * A bare `/<slug>` with no page of its own redirects to the one visible
   * page that slug names. A slug more than one page shares (every `start`,
   * say) is ambiguous and resolves to nothing rather than to the wrong page.
   */
  private async redirectFor(url: string, viewer: Viewer): Promise<Resolution> {
    const segments = segmentsOf(url);
    if (segments.length !== 1) return { kind: "not_found" };

    const candidates = await this.db
      .select({ url: contentPages.url })
      .from(contentPages)
      .where(eq(contentPages.slug, segments[0]));
    if (candidates.length !== 1) return { kind: "not_found" };

    const target = candidates[0].url;
    const resolved = await this.resolve(target, viewer);
    return resolved.kind === "page"
      ? { kind: "redirect", url: target }
      : { kind: "not_found" };
  }

  private async categoryRows(): Promise<CategoryRow[]> {
    return this.db
      .select({
        id: categories.id,
        slug: categories.slug,
        title: categories.title,
        description: categories.description,
        parentId: categories.parentId,
      })
      .from(categories)
      .orderBy(categories.position, categories.title);
  }

  private categoryUrl(row: CategoryRow, rows: CategoryRow[]): string {
    const parent = rows.find((candidate) => candidate.id === row.parentId);
    return parent ? `/${parent.slug}/${row.slug}` : `/${row.slug}`;
  }

  private categoryRef(row: CategoryRow, rows: CategoryRow[]): CategoryRef {
    return {
      slug: row.slug,
      url: this.categoryUrl(row, rows),
      title: row.title,
      description: row.description,
    };
  }

  /** The ids of the categories that list at least one page to `viewer`. */
  private async listingCategoryIds(viewer: Viewer): Promise<Set<string>> {
    const rows = await this.db
      .selectDistinct({ categoryId: contentPages.categoryId })
      .from(contentPages)
      .where(
        and(
          sql`${contentPages.parentId} is null`,
          visibleSql(sql`${contentPages.visibility}`, viewer),
        ),
      );
    return new Set(rows.flatMap((row) => row.categoryId ?? []));
  }

  /**
   * The categories the site lists, in order, each with its subcategories. A
   * category with nothing to list, in it or in its subcategories, is left out.
   */
  async categoryTree(viewer: Viewer = "public"): Promise<CategoryNode[]> {
    const [rows, listing] = await Promise.all([
      this.categoryRows(),
      this.listingCategoryIds(viewer),
    ]);
    return rows
      .filter((row) => row.parentId === null)
      .map((row) => ({
        row,
        subcategories: rows.filter(
          (sub) => sub.parentId === row.id && listing.has(sub.id),
        ),
      }))
      .filter(
        ({ row, subcategories }) =>
          listing.has(row.id) || subcategories.length > 0,
      )
      .map(({ row, subcategories }) => ({
        ...this.categoryRef(row, rows),
        subcategories: subcategories.map((sub) => this.categoryRef(sub, rows)),
      }));
  }

  /**
   * A category page: `[slug]` for a category, `[parent, slug]` for a
   * subcategory. Null when there is no such category or it lists nothing.
   */
  async categoryListing(
    path: [string] | [string, string],
    viewer: Viewer = "public",
  ): Promise<CategoryListing | null> {
    const [rows, listing] = await Promise.all([
      this.categoryRows(),
      this.listingCategoryIds(viewer),
    ]);
    const parent =
      path.length === 2
        ? rows.find((row) => row.slug === path[0] && row.parentId === null)
        : undefined;
    if (path.length === 2 && !parent) return null;
    const category = rows.find(
      (row) =>
        row.slug === path[path.length - 1] &&
        row.parentId === (parent?.id ?? null),
    );
    if (!category) return null;

    const subcategories = rows.filter(
      (row) => row.parentId === category.id && listing.has(row.id),
    );
    if (!listing.has(category.id) && subcategories.length === 0) return null;

    const pages = await this.db
      .select({
        url: contentPages.url,
        title: contentPages.title,
        description: contentPages.description,
        formId: contentPages.formId,
        frontmatter: contentPages.frontmatter,
      })
      .from(contentPages)
      .where(
        and(
          eq(contentPages.categoryId, category.id),
          sql`${contentPages.parentId} is null`,
          visibleSql(sql`${contentPages.visibility}`, viewer),
        ),
      );

    return {
      category: this.categoryRef(category, rows),
      parent: parent ? this.categoryRef(parent, rows) : null,
      subcategories: subcategories.map((row) => this.categoryRef(row, rows)),
      pages: pages
        .map((page) => ({
          url: page.url,
          title: page.title,
          description: page.description,
          digital: isDigital(page.formId, page.frontmatter),
        }))
        .sort(byTitle),
    };
  }

  /**
   * Every page `viewer` can open, other than `start` steps: those are a
   * form's way in, not a page of their own.
   */
  private async visiblePages(viewer: Viewer) {
    const { rows } = await this.db.execute<{
      id: string;
      url: string;
      title: string;
      description: string | null;
      form_id: string | null;
      frontmatter: Frontmatter;
    }>(sql`
      with recursive visible as (
        select id, parent_id, slug, url, title, description, form_id, frontmatter
          from content_pages
          where parent_id is null and ${visibleSql(sql.raw("visibility"), viewer)}
        union all
        select p.id, p.parent_id, p.slug, p.url, p.title, p.description, p.form_id, p.frontmatter
          from content_pages p join visible v on p.parent_id = v.id
          where ${visibleSql(sql.raw("p.visibility"), viewer)}
      )
      select id, url, title, description, form_id, frontmatter from visible
        where not (parent_id is not null and slug = 'start')`);
    return rows;
  }

  /** Every page `viewer` can open, A to Z: for the sitemap and service lists. */
  async catalog(viewer: Viewer = "public"): Promise<CatalogEntry[]> {
    return (await this.visiblePages(viewer))
      .map((page) => ({
        url: page.url,
        title: page.title,
        description: page.description,
        digital: isDigital(page.form_id, page.frontmatter),
        stage: page.frontmatter.stage ?? null,
      }))
      .sort(byTitle);
  }

  /** What search indexes: every page `viewer` can open, with its text. */
  async searchDocuments(viewer: Viewer = "public"): Promise<SearchDocument[]> {
    const pages = await this.visiblePages(viewer);
    const chunks =
      pages.length === 0
        ? []
        : await this.db
            .select({
              pageId: searchChunks.pageId,
              heading: searchChunks.heading,
              body: searchChunks.body,
            })
            .from(searchChunks)
            .where(
              inArray(
                searchChunks.pageId,
                pages.map((page) => page.id),
              ),
            )
            .orderBy(searchChunks.pageId, searchChunks.ordinal);
    const byPage = new Map<string, SearchChunk[]>();
    for (const { pageId, heading, body } of chunks) {
      byPage.set(pageId, [...(byPage.get(pageId) ?? []), { heading, body }]);
    }
    return pages
      .map((page) => ({
        url: page.url,
        title: page.title,
        description: page.description,
        digital: isDigital(page.form_id, page.frontmatter),
        keywords: page.frontmatter.keywords ?? [],
        chunks: byPage.get(page.id) ?? [],
      }))
      .sort(byTitle);
  }

  /**
   * The estate grouped into services: a categorised page at the root of its
   * category is an entry, and every page beneath it by `parent_id` (its
   * `start` step, supporting pages) belongs to it. Uncategorised root pages
   * such as `/terms-conditions` are not services.
   */
  async listServices(): Promise<ServiceSummary[]> {
    const rows = await this.db
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
      .leftJoin(categories, eq(contentPages.categoryId, categories.id));

    // ponytail: groups the whole estate in memory; move to SQL or page it past a few thousand pages.
    const byId = new Map(rows.map((row) => [row.id, row]));
    const rootOf = (row: (typeof rows)[number]) => {
      const seen = new Set<string>();
      let current = row;
      while (current.parentId && !seen.has(current.id)) {
        seen.add(current.id);
        current = byId.get(current.parentId) ?? current;
      }
      return current;
    };
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const root = rootOf(row).id;
      groups.set(root, [...(groups.get(root) ?? []), row]);
    }

    return [...groups]
      .flatMap(([rootId, pages]) => {
        const entry = byId.get(rootId);
        if (!entry?.categorySlug || !entry.categoryTitle) return [];
        const start = pages.find(
          (page) => page.parentId === entry.id && page.slug === "start",
        );
        return [
          {
            id: entry.id,
            url: entry.url,
            title: entry.title,
            category: { slug: entry.categorySlug, title: entry.categoryTitle },
            visibility: entry.visibility,
            form_id: entry.formId ?? start?.formId ?? null,
            has_start_page: start !== undefined,
            page_count: pages.length,
            updated_at: new Date(
              Math.max(...pages.map((page) => page.updatedAt.getTime())),
            ).toISOString(),
          },
        ];
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async get(id: string): Promise<PageDocument | null> {
    const rows = await this.db
      .select()
      .from(contentPages)
      .where(eq(contentPages.id, id));
    return rows[0] ? toDocument(rows[0]) : null;
  }

  private valuesOf(input: PageInput) {
    return {
      url: input.url,
      slug: segmentsOf(input.url).at(-1) ?? "",
      title: input.title,
      description: input.description ?? null,
      visibility: input.visibility ?? "draft",
      formId: input.form_id ?? null,
      bodyMarkdown: input.body_markdown,
      frontmatter: input.frontmatter ?? {},
    };
  }

  /**
   * Where a write puts the page. A save that leaves `parent_id` out keeps
   * the page's parent: PUT replaces the page, but omitting a field a client
   * does not know about must not detach a sub-page, and so publish it. A
   * sub-page that names no category takes its parent's.
   *
   * Setting a parent takes a transaction-scoped lock before checking for a
   * cycle, so two saves that would each close a loop cannot both pass.
   */
  private async placementOf(
    tx: Transaction,
    id: string | undefined,
    input: PageInput,
  ): Promise<{ parentId: string | null; categoryId: string | null }> {
    let parentId = input.parent_id ?? null;
    if (input.parent_id === undefined && id) {
      const [current] = await tx
        .select({ parentId: contentPages.parentId })
        .from(contentPages)
        .where(eq(contentPages.id, id));
      parentId = current?.parentId ?? null;
    }
    let categoryId = input.category_id ?? null;
    if (parentId === null) return { parentId, categoryId };

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('content_pages.parent_id'))`,
    );
    if (id) await this.refuseCycle(tx, id, parentId);
    if (categoryId === null) {
      const [parent] = await tx
        .select({ categoryId: contentPages.categoryId })
        .from(contentPages)
        .where(eq(contentPages.id, parentId));
      categoryId = parent?.categoryId ?? null;
    }
    return { parentId, categoryId };
  }

  /**
   * Give a page's uncategorised sub-pages, all the way down, its category.
   * `on update cascade` moves sub-pages that had the parent's old category,
   * but the composite key skips a row whose category is null, so a parent
   * that gains its first category would otherwise leave them behind.
   */
  private async fileUncategorisedBelow(
    tx: Transaction,
    id: string,
    categoryId: string,
  ) {
    await tx.execute(sql`
      with recursive below as (
        select id from content_pages where parent_id = ${id}
        union all
        select p.id from content_pages p join below b on p.parent_id = b.id
      ) cycle id set is_cycle using path
      update content_pages set category_id = ${categoryId}
        where category_id is null
          and id in (select id from below where not is_cycle)`);
  }

  /** A page cannot sit beneath itself, directly or further down. */
  private async refuseCycle(tx: Transaction, id: string, parentId: string) {
    const above = await tx.execute<{ id: string }>(sql`
      with recursive chain as (
        select id, parent_id from content_pages where id = ${parentId}
        union all
        select p.id, p.parent_id from content_pages p
          join chain on p.id = chain.parent_id
      ) cycle id set is_cycle using path
      select id from chain`);
    if (parentId === id || above.rows.some((row) => row.id === id)) {
      throw new ValidationFailedError([
        { field: "parent_id", message: "A page cannot be its own sub-page." },
      ]);
    }
  }

  async create(input: PageInput, actorId: string): Promise<PageDocument> {
    const values = this.valuesOf(input);
    return this.db
      .transaction(async (tx) => {
        const placement = await this.placementOf(tx, input.id, input);
        const [inserted] = await tx
          .insert(contentPages)
          .values({
            ...(input.id ? { id: input.id } : {}),
            ...values,
            ...placement,
            publishedAt: values.visibility === "public" ? new Date() : null,
          })
          .returning();
        const saved = toDocument(inserted);
        await writeSearchChunks(tx, saved.id, saved.body_markdown);
        await this.appendChangeEvent(tx, saved, "created", actorId);
        return saved;
      })
      .catch((error: unknown) => {
        throw asValidationError(error);
      });
  }

  async save(
    id: string,
    input: PageInput,
    ifUpdatedAt: string | null,
    actorId: string,
  ): Promise<PageDocument> {
    const values = this.valuesOf(input);
    const now = new Date();

    // Zero rows affected means someone else changed the row first. Expressed
    // as two shapes rather than one clever predicate: a caller that has never
    // read the row passes null and means "I accept whatever is there".
    const where = ifUpdatedAt
      ? and(
          eq(contentPages.id, id),
          eq(contentPages.updatedAt, new Date(ifUpdatedAt)),
        )
      : eq(contentPages.id, id);

    const saved = await this.db
      .transaction(async (tx) => {
        const updated = await tx
          .update(contentPages)
          .set({
            ...values,
            ...(await this.placementOf(tx, id, input)),
            updatedAt: now,
            // The first time it goes public, and never moved after that.
            ...(values.visibility === "public"
              ? {
                  publishedAt: sql`coalesce(${contentPages.publishedAt}, ${now.toISOString()}::timestamptz)`,
                }
              : {}),
          })
          .where(where)
          .returning();
        if (updated.length === 0) return null;

        const document = toDocument(updated[0]);
        if (document.category_id !== null) {
          await this.fileUncategorisedBelow(tx, id, document.category_id);
        }
        await writeSearchChunks(tx, id, document.body_markdown);
        const firstPublished = document.published_at === now.toISOString();
        await this.appendChangeEvent(
          tx,
          document,
          firstPublished ? "published" : "updated",
          actorId,
        );
        return document;
      })
      .catch((error: unknown) => {
        throw asValidationError(error);
      });

    if (saved === null) {
      // Distinguish "gone" from "changed underneath you": a 404 and a 409 are
      // different problems and the editor says different things about them.
      const exists = await this.get(id);
      if (!exists) throw new NotFoundError(`No document with id ${id}`);
      throw new ConflictError(id);
    }
    return saved;
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(contentPages)
      .where(eq(contentPages.id, id))
      .catch((error: unknown) => {
        if (driverCause(error)?.code === "23503") {
          throw new ValidationFailedError([
            {
              field: "id",
              message:
                "This page has sub-pages. Move or delete them before deleting it.",
            },
          ]);
        }
        throw error;
      });
  }

  /**
   * A cheap token for "has anything changed".
   *
   * `change_events` is append-only and gets a row on every write, so its
   * count plus its newest timestamp identify the state of the whole estate
   * without reading any of it. Clients poll this and refetch only when it
   * moves.
   */
  async version(): Promise<{ count: number; latest: string | null }> {
    const [row] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        latest: sql<string | null>`max(${changeEvents.occurredAt})::text`,
      })
      .from(changeEvents);
    return { count: Number(row?.count ?? 0), latest: row?.latest ?? null };
  }

  private async appendChangeEvent(
    db: Executor,
    doc: PageDocument,
    action: "created" | "updated" | "published",
    actorId: string,
  ): Promise<void> {
    const [next] = await db
      .select({
        versionNo: sql<number>`coalesce(max(${changeEvents.versionNo}), 0) + 1`,
      })
      .from(changeEvents)
      .where(
        and(
          eq(changeEvents.entityKind, "content_page"),
          eq(changeEvents.entityId, doc.id),
        ),
      );

    await db.insert(changeEvents).values({
      entityKind: "content_page",
      entityId: doc.id,
      versionNo: Number(next?.versionNo ?? 1),
      action,
      actor: actorId,
      snapshot: doc,
    });
  }
}
