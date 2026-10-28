import type { Category } from "../api/categories";
import { ApiFailure, type ApiPage, type EditorApi, type FieldError } from "../api/client";
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
  | { kind: "forbidden"; message: string }
  | { kind: "conflict" | "missing" | "signed-out" | "failed" };

/** Page source with its frontmatter's visibility line and trailing whitespace taken out; the body is otherwise as written. */
function withoutVisibility(markdown: string) {
  return markdown
    .trimEnd()
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, (frontmatter) =>
      frontmatter.replace(/^visibility:.*(?:\r?\n|$)/m, ""),
    );
}

/** Save a draft over the version it was edited from; the API refuses it if that version has moved on. */
export async function savePageDraft(
  api: Pick<EditorApi, "savePage">,
  base: ServerPageBaseline,
  markdown: string,
  categories: readonly Category[],
): Promise<PageSaveOutcome> {
  const fields = markdownToPageSaveInput(markdown, base.page, categories);

  if (!fields.ok) return { kind: "invalid", errors: fields.errors };

  // Taking a public page out of view changes only who can see it (api_v2 ignores the rest), so other edits wait.
  // The source is compared as written, so a baseline that wouldn't parse can't wave other edits through.
  const hiding = base.page.visibility === "public" && fields.value.visibility !== "public";

  if (hiding && withoutVisibility(markdown) !== withoutVisibility(base.markdown))
    return {
      kind: "invalid",
      errors: [
        {
          field: "visibility",
          message: "Save your other changes before you change who can see the page",
        },
      ],
    };

  try {
    const page = await api.savePage(base.page.id, fields.value, base.page.updated_at);

    // api_v2 kept only the visibility, so the saved version is what it stored, not what was sent
    if (hiding) {
      const stored = { page, markdown: pageToMarkdown(page, categories) };

      return base.page.pending_revision
        ? { kind: "saved", base: stored, discarded: true }
        : { kind: "saved", base: stored };
    }

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
