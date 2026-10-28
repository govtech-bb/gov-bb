import type { Category } from "../api/categories";
import {
  ApiFailure,
  type ApiPage,
  type EditorApi,
  type FieldError,
  type SavePageInput,
} from "../api/client";
import { apiMessage } from "../api/failure-messages";
import { markdownToPageSaveInput, pageToMarkdown } from "../api/page-markdown";
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
  /** `discarded`: taking the page out of public view discarded its unreviewed change, so `base` is the live page. */
  | { kind: "saved"; base: ServerPageBaseline; discarded?: true }
  | { kind: "invalid"; errors: readonly FieldError[] }
  | { kind: "forbidden" | "under-review"; message: string }
  | { kind: "conflict" | "missing" | "signed-out" | "failed" };

/** Save a draft over the version it was edited from; the API refuses it if that version has moved on. */
export async function savePageDraft(
  api: Pick<EditorApi, "savePage">,
  base: ServerPageBaseline,
  markdown: string,
  categories: readonly Category[],
): Promise<PageSaveOutcome> {
  const fields = markdownToPageSaveInput(markdown, base.page, categories);

  if (!fields.ok) return { kind: "invalid", errors: fields.errors };

  // Taking a public page out of view changes only who can see it (api_v2 ignores the rest), so other edits wait
  if (base.page.visibility === "public" && fields.value.visibility !== "public") {
    const before = markdownToPageSaveInput(base.markdown, base.page, categories);
    const after = fields.value;

    // SAFETY: Object.keys of a parsed SavePageInput yields only its own field names.
    const edited = before.ok
      ? (Object.keys(before.value) as (keyof SavePageInput)[]).filter(
          (field) =>
            field !== "visibility" &&
            JSON.stringify(before.value[field]) !== JSON.stringify(after[field]),
        )
      : [];

    if (edited.length > 0)
      return {
        kind: "invalid",
        errors: edited.map((field) => ({
          field,
          message: "Save this change before you change who can see the page",
        })),
      };
  }

  try {
    const page = await api.savePage(base.page.id, fields.value, base.page.updated_at);

    // The unreviewed change was discarded, so the saved version is the live content
    if (base.page.pending_revision && page.visibility !== "public")
      return {
        kind: "saved",
        base: { page, markdown: pageToMarkdown(page, categories) },
        discarded: true,
      };

    return { kind: "saved", base: { page, markdown } };
  } catch (error) {
    if (!(error instanceof ApiFailure)) throw error;

    switch (error.status) {
      case 422:
        return { kind: "invalid", errors: error.errors };
      case 409:
        // Until #3203, a change waiting for review can't be saved over
        return error.code === "under_review"
          ? {
              kind: "under-review",
              message: apiMessage(error) ?? "This change is waiting for review.",
            }
          : { kind: "conflict" };
      case 404:
        return { kind: "missing" };
      case 401:
        return { kind: "signed-out" };
      case 403:
        return {
          kind: "forbidden",
          message: apiMessage(error) ?? "You don't have permission to save this change.",
        };
      default:
        return { kind: "failed" };
    }
  }
}
