/**
 * Every query lives here.
 *
 * Two audiences, two shapes. The site reads a `PageResponse` by url: public
 * pages only, the hast ready to render, the Start link already removed when
 * it leads nowhere public, and the breadcrumb trail resolved. The editor
 * reads and writes a `PageDocument` by id: every column, markdown and all.
 *
 * The markdown is compiled to hast HERE, inside the write, so what is stored
 * is always what the sanitiser let through.
 */

import type { Root } from "hast";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { compileMarkdown, hideStartLinks } from "./markdown";
import {
  categories,
  changeEvents,
  contentPages,
  forms,
  type Frontmatter,
  type Visibility,
} from "./schema";

/** Either driver: `node-postgres` in production, PGlite under test. */
export type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

/** A page as the editor reads and writes it. */
export interface PageDocument {
  id: string;
  url: string;
  slug: string;
  category_id: string | null;
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
  hast: Root;
  breadcrumbs: Breadcrumb[];
}

export type Resolution =
  | { kind: "page"; page: PageResponse }
  | { kind: "redirect"; url: string }
  | { kind: "not_found" };

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

/** A write the database refused: an unknown form or category, a taken url. */
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

/** `/a/b/c` → `["/a", "/a/b", "/a/b/c"]`. */
const prefixesOf = (url: string) =>
  segmentsOf(url).map(
    (_, i, segments) => `/${segments.slice(0, i + 1).join("/")}`,
  );

/**
 * The database's own refusals, as the 422 an editor can act on. Drizzle
 * wraps the driver's error, so the SQLSTATE is on the cause.
 */
function asValidationError(error: unknown): unknown {
  const cause = (error as { cause?: { code?: string; constraint?: string } })
    .cause;
  const constraint = cause?.constraint ?? "";
  if (cause?.code === "23503") {
    const field = constraint.includes("form_id") ? "form_id" : "category_id";
    return new ValidationFailedError([
      { field, message: `No ${field.replace("_id", "")} with that id.` },
    ]);
  }
  if (cause?.code === "23505") {
    const field = constraint === "content_pages_pkey" ? "id" : "url";
    return new ValidationFailedError([
      { field, message: `Another page already has this ${field}.` },
    ]);
  }
  return error;
}

export class ApiStore {
  constructor(private readonly db: Database) {}

  /**
   * The site's read: the page at `url` if it and every page above it are
   * public, with its Start link removed when the `/start` sub-page or its
   * form is not.
   */
  async resolve(url: string): Promise<Resolution> {
    const prefixes = prefixesOf(url);
    const startUrl = `${url}/start`;
    const rows = await this.db
      .select({
        url: contentPages.url,
        title: contentPages.title,
        description: contentPages.description,
        visibility: contentPages.visibility,
        formId: contentPages.formId,
        hast: contentPages.hast,
        frontmatter: contentPages.frontmatter,
      })
      .from(contentPages)
      .where(inArray(contentPages.url, [url, ...prefixes, startUrl]));
    const byUrl = new Map(rows.map((row) => [row.url, row]));

    const page = byUrl.get(url);
    if (!page) return await this.redirectFor(url);

    // Effective visibility: a page is as hidden as anything above it.
    const hidden = prefixes.some(
      (prefix) =>
        byUrl.has(prefix) && byUrl.get(prefix)!.visibility !== "public",
    );
    if (hidden) return { kind: "not_found" };

    const start = byUrl.get(startUrl);
    const formId = page.formId ?? start?.formId ?? null;
    const formPublic = formId ? await this.isFormPublic(formId) : true;

    if (url.endsWith("/start") && page.formId && !formPublic) {
      return { kind: "not_found" };
    }

    const hideStart =
      (start !== undefined && start.visibility !== "public") || !formPublic;

    return {
      kind: "page",
      page: {
        url: page.url,
        frontmatter: {
          ...page.frontmatter,
          title: page.title,
          ...(page.description ? { description: page.description } : {}),
        },
        hast: hideStart ? hideStartLinks(page.hast) : page.hast,
        breadcrumbs: await this.breadcrumbs(prefixes, byUrl),
      },
    };
  }

  /**
   * A bare `/<slug>` with no page of its own redirects to the one public page
   * that slug names. A slug more than one page shares (every `start`, say) is
   * ambiguous and resolves to nothing rather than to the wrong page.
   */
  private async redirectFor(url: string): Promise<Resolution> {
    const segments = segmentsOf(url);
    if (segments.length !== 1) return { kind: "not_found" };

    const candidates = await this.db
      .select({ url: contentPages.url })
      .from(contentPages)
      .where(eq(contentPages.slug, segments[0]));
    if (candidates.length !== 1) return { kind: "not_found" };

    const target = candidates[0].url;
    const resolved = await this.resolve(target);
    return resolved.kind === "page"
      ? { kind: "redirect", url: target }
      : { kind: "not_found" };
  }

  private async isFormPublic(formId: string): Promise<boolean> {
    const [form] = await this.db
      .select({ visibility: forms.visibility })
      .from(forms)
      .where(eq(forms.formId, formId));
    return form?.visibility === "public";
  }

  /**
   * One crumb per level of the url that names something: the category for
   * the first segment, otherwise the page filed there. A level that names
   * neither (a subcategory has no page of its own) is left out rather than
   * linked to a 404. Every page here is public, or the page being served
   * would not be.
   *
   * The category crumb links `/<category>`, which v1 landing serves as the
   * category's index page. landing_v2 has no category page yet, so until it
   * does that crumb 404s there; it is kept for the site this API serves.
   * Serving the category index is #2928.
   */
  private async breadcrumbs(
    prefixes: string[],
    pages: Map<string, { title: string }>,
  ): Promise<Breadcrumb[]> {
    const [category] = await this.db
      .select({ title: categories.title })
      .from(categories)
      .where(eq(categories.slug, prefixes[0]?.slice(1) ?? ""));

    return prefixes.flatMap((prefix, i) => {
      const page = pages.get(prefix);
      if (page) return [{ name: page.title, url: prefix }];
      if (i === 0 && category) return [{ name: category.title, url: prefix }];
      return [];
    });
  }

  async get(id: string): Promise<PageDocument | null> {
    const rows = await this.db
      .select()
      .from(contentPages)
      .where(eq(contentPages.id, id));
    return rows[0] ? toDocument(rows[0]) : null;
  }

  private async valuesOf(input: PageInput) {
    const formId = input.form_id ?? null;
    return {
      url: input.url,
      slug: segmentsOf(input.url).at(-1) ?? "",
      categoryId: input.category_id ?? null,
      title: input.title,
      description: input.description ?? null,
      visibility: input.visibility ?? "draft",
      formId,
      bodyMarkdown: input.body_markdown,
      hast: await compileMarkdown(input.body_markdown, formId),
      frontmatter: input.frontmatter ?? {},
    };
  }

  async create(input: PageInput): Promise<PageDocument> {
    const values = await this.valuesOf(input);
    const inserted = await this.db
      .insert(contentPages)
      .values({
        ...(input.id ? { id: input.id } : {}),
        ...values,
        publishedAt: values.visibility === "public" ? new Date() : null,
      })
      .returning()
      .catch((error: unknown) => {
        throw asValidationError(error);
      });

    const saved = toDocument(inserted[0]);
    await this.appendChangeEvent(saved, "created");
    return saved;
  }

  async save(
    id: string,
    input: PageInput,
    ifUpdatedAt: string | null,
  ): Promise<PageDocument> {
    const values = await this.valuesOf(input);
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

    const updated = await this.db
      .update(contentPages)
      .set({
        ...values,
        updatedAt: now,
        // The first time it goes public, and never moved after that.
        ...(values.visibility === "public"
          ? {
              publishedAt: sql`coalesce(${contentPages.publishedAt}, ${now.toISOString()}::timestamptz)`,
            }
          : {}),
      })
      .where(where)
      .returning()
      .catch((error: unknown) => {
        throw asValidationError(error);
      });

    if (updated.length === 0) {
      // Distinguish "gone" from "changed underneath you": a 404 and a 409 are
      // different problems and the editor says different things about them.
      const exists = await this.get(id);
      if (!exists) throw new NotFoundError(`No document with id ${id}`);
      throw new ConflictError(id);
    }

    const saved = toDocument(updated[0]);
    const firstPublished = saved.published_at === now.toISOString();
    await this.appendChangeEvent(
      saved,
      firstPublished ? "published" : "updated",
    );
    return saved;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(contentPages).where(eq(contentPages.id, id));
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
    doc: PageDocument,
    action: "created" | "updated" | "published",
  ): Promise<void> {
    const [next] = await this.db
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

    await this.db.insert(changeEvents).values({
      entityKind: "content_page",
      entityId: doc.id,
      versionNo: Number(next?.versionNo ?? 1),
      action,
      snapshot: doc,
    });
  }
}
