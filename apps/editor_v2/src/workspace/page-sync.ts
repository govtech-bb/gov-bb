import {
  ApiFailure,
  type ApiPage,
  type EditorApi,
  type FieldError,
  type TaxonomyCategory,
} from "../api/client";
import { markdownToPageSaveInput, pageToMarkdown } from "../api/page-markdown";
import type { DraftStorage } from "../persistence/types";
import { documentKeys } from "./model";

/** The server's copy of a page as this browser last loaded or saved it, and the Markdown that stood for it. */
export type ServerPageBaseline = { page: ApiPage; markdown: string };

export const serverPageBaselineKey = (id: string) => `govbb-editor:documents:${id}:server`;

/** A stored server copy, or undefined when this browser holds none it can read. */
export function parseServerPageBaseline(
  source: string | null,
  id: string,
): ServerPageBaseline | undefined {
  if (source === null) return undefined;

  try {
    const base: ServerPageBaseline = JSON.parse(source);

    return base.page.id === id && typeof base.markdown === "string" ? base : undefined;
  } catch {
    return undefined;
  }
}

export function writeServerPageBaseline(storage: DraftStorage, base: ServerPageBaseline) {
  storage.setItem(serverPageBaselineKey(base.page.id), JSON.stringify(base));
}

/**
 * Whether a document's browser draft holds nothing of its own: there is none, or it is the server's copy as this
 * browser last had it, with nothing unsaved. Opening such a page shows the server's copy; any other draft is kept.
 */
export function draftFollowsServer(storage: DraftStorage, id: string, keys = documentKeys(id)) {
  const local = storage.getItem(keys.committed);

  return (
    local === null ||
    (local === parseServerPageBaseline(storage.getItem(serverPageBaselineKey(id)), id)?.markdown &&
      storage.getItem(keys.working) === null &&
      !(keys.replacementJournal && storage.getItem(keys.replacementJournal) !== null))
  );
}

/**
 * Put the server's copy of a page in front of its draft before the draft
 * opens. A draft with nothing unsaved follows the server; one with unsaved
 * changes is kept, and the editor offers choices once it sees the server has
 * moved on.
 */
export function seedPageDraftFromServer(
  storage: DraftStorage,
  page: ApiPage,
  categories: readonly TaxonomyCategory[],
): ServerPageBaseline {
  const keys = documentKeys(page.id);
  const base = parseServerPageBaseline(storage.getItem(serverPageBaselineKey(page.id)), page.id);
  const server = { page, markdown: pageToMarkdown(page, categories) };
  const followsServer = draftFollowsServer(storage, page.id, keys);

  if (followsServer) storage.setItem(keys.committed, server.markdown);

  if (!followsServer && base) return base;
  writeServerPageBaseline(storage, server);

  return server;
}

export type PageSaveOutcome =
  | { kind: "saved"; base: ServerPageBaseline }
  | { kind: "invalid"; errors: readonly FieldError[] }
  | { kind: "conflict" | "missing" | "signed-out" | "failed" };

/** Save a draft over the version it was edited from; the API refuses it if that version has moved on. */
export async function savePageDraft(
  api: Pick<EditorApi, "savePage">,
  base: ServerPageBaseline,
  markdown: string,
  categories: readonly TaxonomyCategory[],
): Promise<PageSaveOutcome> {
  const fields = markdownToPageSaveInput(markdown, base.page, categories);

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
