import {
  ApiFailure,
  type ApiPage,
  type EditorApi,
  type FieldError,
  type PageSnapshot,
  type ServiceDetail,
  type TaxonomyCategory,
} from "../api/client";
import { markdownToSaveFields, pageToMarkdown } from "../api/page-markdown";
import type { DraftStorage } from "../persistence/types";
import { documentKeys, type PageDocument, type PageRole } from "./model";

/** The server's copy of a page as this browser last loaded or saved it, and the Markdown that stood for it. */
export type ServerBase = { page: ApiPage; markdown: string };

export const serverBaseKey = (id: string) => `govbb-editor:documents:${id}:server`;

/** A stored server copy, or undefined when this browser holds none it can read. */
export function parseServerBase(source: string | null, id: string): ServerBase | undefined {
  if (source === null) return undefined;

  try {
    const base: ServerBase = JSON.parse(source);

    return base.page.id === id && typeof base.markdown === "string" ? base : undefined;
  } catch {
    return undefined;
  }
}

export function writeServerBase(storage: DraftStorage, base: ServerBase) {
  storage.setItem(serverBaseKey(base.page.id), JSON.stringify(base));
}

/**
 * Put the server's copy of a page in front of its draft before the draft
 * opens. A draft with nothing unsaved follows the server; one with unsaved
 * changes is kept, and the editor offers choices once it sees the server has
 * moved on.
 */
export function seedApiPage(
  storage: DraftStorage,
  page: ApiPage,
  categories: readonly TaxonomyCategory[],
): ServerBase {
  const keys = documentKeys(page.id);
  const base = parseServerBase(storage.getItem(serverBaseKey(page.id)), page.id);
  const local = storage.getItem(keys.committed);
  const server = { page, markdown: pageToMarkdown(page, categories) };

  const followsServer =
    local === null ||
    (local === base?.markdown &&
      storage.getItem(keys.working) === null &&
      !(keys.replacementJournal && storage.getItem(keys.replacementJournal) !== null));

  if (followsServer) storage.setItem(keys.committed, server.markdown);

  if (!followsServer && base) return base;
  writeServerBase(storage, server);

  return server;
}

const ROLE_ORDER: Record<PageRole, number> = { entry: 0, start: 1, supporting: 2 };

/** A page of an opened service as the workspace lists it. */
export function apiPageDocument(page: { id: string; title: string; role: PageRole }): PageDocument {
  return {
    id: page.id,
    title: page.title,
    kind: "page",
    role: page.role,
    keys: documentKeys(page.id),
  };
}

/** A service's pages: the entry page, its start page, then the rest as the API orders them. */
export function serviceDocuments(detail: ServiceDetail) {
  return detail.pages.map(apiPageDocument).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

/** A page's role from the page alone, for a page opened before its service has loaded. */
export function roleOf(page: ApiPage): PageRole {
  if (page.parent_id === null) return "entry";

  return page.slug === "start" ? "start" : "supporting";
}

export type SaveOutcome =
  | { kind: "saved"; base: ServerBase }
  | { kind: "invalid"; errors: readonly FieldError[] }
  | { kind: "conflict" | "missing" | "signed-out" | "failed" };

/** Save a draft over the version it was edited from; the API refuses it if that version has moved on. */
export async function savePage(
  api: Pick<EditorApi, "savePage">,
  base: ServerBase,
  markdown: string,
  categories: readonly TaxonomyCategory[],
): Promise<SaveOutcome> {
  const fields = markdownToSaveFields(markdown, base.page, categories);

  if (!fields.ok) return { kind: "invalid", errors: fields.errors };

  try {
    const page = await api.savePage(base.page.id, fields.value, base.page.updated_at);

    return { kind: "saved", base: { page, markdown } };
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;

    switch (error.status) {
      case 422:
        return { kind: "invalid", errors: error.errors };
      case 409:
        return { kind: "conflict" };
      case 404:
        return { kind: "missing" };
      case 401:
        return { kind: "signed-out" };
      default:
        return { kind: "failed" };
    }
  }
}

const FIELD_LABELS = new Map([
  ["title", "Title"],
  ["url", "Path"],
  ["category", "Category"],
  ["category_id", "Category"],
  ["subcategory", "Subcategory"],
  ["description", "Description"],
  ["visibility", "Visibility"],
  ["form_id", "Form ID"],
  ["publish_date", "Publication date"],
  ["lede", "Introduction"],
  ["parent_id", "Parent page"],
  ["id", "Page"],
]);

/** How the editor names a field the API refused. */
export const fieldLabel = (field: string) => FIELD_LABELS.get(field) ?? field;

/**
 * A past version's content over the page as it stands. Its path, category,
 * parent and visibility stay as they are: restoring an old visibility could
 * unpublish a live page.
 */
export function restoredMarkdown(
  current: ApiPage,
  version: PageSnapshot,
  categories: readonly TaxonomyCategory[],
) {
  return pageToMarkdown(
    {
      ...current,
      title: version.title,
      description: version.description,
      form_id: version.form_id,
      body_markdown: version.body_markdown,
      frontmatter: version.frontmatter,
    },
    categories,
  );
}
