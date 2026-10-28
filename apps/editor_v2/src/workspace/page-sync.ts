import {
  ApiFailure,
  type ApiPage,
  type EditorApi,
  type FieldError,
  type SavedCategory,
} from "../api/client";
import { markdownToPageSaveInput } from "../api/page-markdown";
import type { DraftStore } from "../persistence/draft-store";

/** The exact page version and submitted Markdown last loaded or saved in this session. */
export type ServerPageBaseline = { page: ApiPage; markdown: string };

/** Mounted page registration; live getters let navigation see edits and pending saves immediately. */
export type PageSession = {
  store: DraftStore;
  getBaseline: () => ServerPageBaseline;
  isSaving: () => boolean;
};

/** Unapplied source and serialization failures count as unsaved, even when applied text still matches. */
export function pageHasUnsavedChanges(session: PageSession) {
  const draft = session.store.getSnapshot();

  return (
    !draft.valid ||
    draft.dirty ||
    draft.status === "error" ||
    draft.committed !== session.getBaseline().markdown
  );
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
  categories: readonly SavedCategory[],
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
