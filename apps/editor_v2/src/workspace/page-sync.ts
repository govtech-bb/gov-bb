import type { Category } from "../api/categories";
import type { ApiPage, EditorApi, FieldError } from "../api/client";
import { markdownToPageSaveInput } from "../api/page-markdown";
import type { PageEditLockToken } from "../api/page-schemas";
import type { DraftStore } from "../persistence/draft-store";

/** The exact page version and submitted Markdown last loaded or saved in this session. */
export type PageEditBaseline = { readonly page: ApiPage; readonly markdown: string };

/** Mounted page registration; live getters let navigation see edits and pending saves immediately. */
export type PageSession = {
  store: DraftStore;
  getBaseline: () => PageEditBaseline;
  getEditLockToken: () => PageEditLockToken | undefined;
  isSaving: () => boolean;
};

/** Unapplied source and serialization failures count as unsaved, even when applied text still matches. */
export function pageHasUnsavedChanges(session: Pick<PageSession, "store" | "getBaseline">) {
  const draft = session.store.getSnapshot();

  return (
    !draft.valid ||
    draft.dirty ||
    draft.status === "error" ||
    draft.committed !== session.getBaseline().markdown
  );
}

/** Saving distinguishes content conflicts, lost ownership and uncertain acknowledgement. */
export type PageSaveOutcome =
  | { kind: "saved"; base: PageEditBaseline }
  | { kind: "invalid"; errors: readonly FieldError[] }
  | {
      kind:
        | "conflict"
        | "missing"
        | "signed-out"
        | "forbidden"
        | "lock-lost"
        | "outcome-unknown"
        | "failed";
    };

/** Explicitly save the submitted Markdown over its reviewed version; newer edits remain dirty. */
export async function savePageChanges(
  api: Pick<EditorApi, "savePage">,
  base: PageEditBaseline,
  markdown: string,
  categories: readonly Category[],
  editLockToken: PageEditLockToken,
): Promise<PageSaveOutcome> {
  const fields = markdownToPageSaveInput(markdown, base.page, categories);

  if (!fields.ok) return { kind: "invalid", errors: fields.errors };
  const result = await api.savePage(base.page.id, fields.value, editLockToken);

  if (result.ok) return { kind: "saved", base: { page: result.value, markdown } };
  const error = result.error;

  switch (error.kind) {
    case "invalid":
      return { kind: "invalid", errors: error.errors };
    case "version-conflict":
      return { kind: "conflict" };
    case "lock-required":
    case "lock-lost":
    case "lock-conflict":
      return { kind: "lock-lost" };
    case "missing":
      return { kind: "missing" };
    case "signed-out":
      return { kind: "signed-out" };
    case "forbidden":
      return { kind: "forbidden" };
    case "outcome-unknown":
      return { kind: "outcome-unknown" };
    case "unavailable":
    case "invalid-response":
      return { kind: "failed" };
    default: {
      const unexpected: never = error;
      throw unexpected;
    }
  }
}
