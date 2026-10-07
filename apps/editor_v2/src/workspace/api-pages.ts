import type { ApiPage, ServiceDetail, TaxonomyCategory } from "../api/client";
import { pageToMarkdown } from "../api/page-markdown";
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
  storage.setItem(serverBaseKey(page.id), JSON.stringify(server));

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
