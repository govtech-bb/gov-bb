import {
  ApiFailure,
  type ApiPage,
  type EditorApi,
  type FieldError,
  type PageSnapshot,
  type SaveFields,
  type ServiceDetail,
} from "../api/client";
import type { DraftStorage } from "../persistence/types";
import { govbbPageBodyCodec } from "../presets/govbb-page";
import { documentKeys, type PageDocument, type PageRole } from "./model";
import { detailsOf, detailsProblems, sameDetails, type PageDetails } from "./page-details";

/** The server's copy of a page as this browser last loaded or saved it, and the body Markdown that stood for it. */
export type ServerBase = { page: ApiPage; body: string };

export const serverBaseKey = (id: string) => `govbb-editor:documents:${id}:server`;

/** A stored server copy, or undefined when this browser holds none it can read. */
export function parseServerBase(source: string | null, id: string): ServerBase | undefined {
  if (source === null) return undefined;

  try {
    const base: ServerBase = JSON.parse(source);

    return base.page.id === id && typeof base.body === "string" ? base : undefined;
  } catch {
    return undefined;
  }
}

export function writeServerBase(storage: DraftStorage, base: ServerBase) {
  storage.setItem(serverBaseKey(base.page.id), JSON.stringify(base));
}

export const detailsKey = (id: string) => `govbb-editor:documents:${id}:details`;

/** Stored details, or undefined when there are none this browser can read. */
export function parseDetails(source: string | null): PageDetails | undefined {
  try {
    const details: PageDetails | null = JSON.parse(source ?? "null");

    return details && typeof details.title === "string" && typeof details.url === "string"
      ? details
      : undefined;
  } catch {
    return undefined;
  }
}

const readDetails = (storage: DraftStorage, id: string) =>
  parseDetails(storage.getItem(detailsKey(id)));

export function writeDetails(storage: DraftStorage, id: string, details: PageDetails) {
  storage.setItem(detailsKey(id), JSON.stringify(details));
}

/** A body as the editor writes it, so opening a page never marks it unsaved. */
export function canonicalBody(body: string) {
  try {
    const prepared = govbbPageBodyCodec.prepare(body);

    return prepared.mode === "source" ? body : govbbPageBodyCodec.encode(prepared.state);
  } catch {
    return body;
  }
}

/** A server copy saved while page details were YAML frontmatter in the draft. */
function isFrontmatterBase(source: string | null) {
  try {
    return source !== null && typeof JSON.parse(source).markdown === "string";
  } catch {
    return false;
  }
}

/**
 * Put the server's copy of a page in front of its draft before the draft
 * opens. A draft with nothing unsaved follows the server; one with unsaved
 * changes is kept, and the editor offers choices once it sees the server has
 * moved on.
 */
export function seedApiPage(storage: DraftStorage, page: ApiPage): ServerBase {
  const keys = documentKeys(page.id);
  const stored = storage.getItem(serverBaseKey(page.id));

  // Drafts from before details were fields hold YAML in their body. editor_v2 was never deployed with them.
  if (isFrontmatterBase(stored))
    for (const key of [keys.committed, keys.working, keys.replacementJournal])
      if (key) storage.removeItem(key);

  const base = parseServerBase(stored, page.id);
  const local = storage.getItem(keys.committed);
  const details = readDetails(storage, page.id);

  const followsServer =
    local === null ||
    (!!base &&
      local === base.body &&
      (!details || sameDetails(details, detailsOf(base.page))) &&
      storage.getItem(keys.working) === null &&
      !(keys.replacementJournal && storage.getItem(keys.replacementJournal) !== null));

  const next = !followsServer && base ? base : { page, body: canonicalBody(page.body_markdown) };

  if (followsServer) storage.setItem(keys.committed, next.body);

  if (followsServer || !details) writeDetails(storage, page.id, detailsOf(next.page));

  if (next !== base) writeServerBase(storage, next);

  return next;
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
  details: PageDetails,
  body: string,
): Promise<SaveOutcome> {
  const errors = detailsProblems(details, base.page.parent_id === null);

  if (errors.length > 0) return { kind: "invalid", errors };

  const fields: SaveFields = {
    ...details,
    // An unchanged body goes back exactly as the server sent it.
    body_markdown: body === base.body ? base.page.body_markdown : body.trim(),
  };

  try {
    const page = await api.savePage(base.page.id, fields, base.page.updated_at);

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
