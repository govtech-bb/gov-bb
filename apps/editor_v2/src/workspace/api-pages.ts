import {
  ApiFailure,
  type ApiPage,
  type EditorApi,
  type FieldError,
  type PageSnapshot,
  type SaveFields,
  type ServiceDetail,
} from "../api/client";
import { govbbPageBodyCodec } from "../presets/govbb-page";
import { documentKeys, type PageDocument, type PageRole } from "./model";
import { detailsProblems, type PageDetails } from "./page-details";

/** The published page, and the body Markdown that stood for it when this editor last read or published it. */
export type ServerBase = { page: ApiPage; body: string };

/** A body as the editor writes it, so opening a page never marks it changed. */
export function canonicalBody(body: string) {
  try {
    const prepared = govbbPageBodyCodec.prepare(body);

    return prepared.mode === "source" ? body : govbbPageBodyCodec.encode(prepared.state);
  } catch {
    return body;
  }
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

/**
 * Save a draft over the version it was edited from; the API refuses it if that version has moved
 * on, or if the server's draft, which saving discards, is not `draftVersion`, the one last read.
 */
export async function savePage(
  api: Pick<EditorApi, "savePage">,
  base: ServerBase,
  details: PageDetails,
  body: string,
  draftVersion: string | null = null,
): Promise<SaveOutcome> {
  const errors = detailsProblems(details, base.page.parent_id === null);

  if (errors.length > 0) return { kind: "invalid", errors };

  const fields: SaveFields = {
    ...details,
    // An unchanged body goes back exactly as the server sent it.
    body_markdown: body === base.body ? base.page.body_markdown : body.trim(),
  };

  try {
    const page = await api.savePage(
      base.page.id,
      fields,
      base.page.updated_at,
      draftVersion ?? undefined,
    );

    return { kind: "saved", base: { page, body } };
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
 * A past version's details over the draft's. Its path, category and
 * visibility stay as they are: restoring an old visibility could unpublish a
 * live page.
 */
export function restoredDetails(current: PageDetails, version: PageSnapshot): PageDetails {
  return {
    ...current,
    title: version.title,
    description: version.description,
    form_id: version.form_id,
    frontmatter: version.frontmatter,
  };
}
