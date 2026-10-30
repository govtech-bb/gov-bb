import type { Category } from "../api/categories";
import type { ApiPage, EditorApi, FieldError } from "../api/client";
import { markdownToPageSaveInput, pageToMarkdown } from "../api/page-markdown";
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

/** Saving distinguishes content conflicts, lost ownership, policy refusals and uncertain acknowledgement. */
export type PageSaveOutcome =
  /** `discarded`: taking the page out of public view discarded its unreviewed change, so `base` is the live page. */
  | { kind: "saved"; base: PageEditBaseline; discarded?: true }
  | { kind: "invalid"; errors: readonly FieldError[] }
  /** A role or review-policy refusal: saving again won't change the answer, and ownership is not in doubt. */
  | { kind: "forbidden"; message: string }
  | {
      kind: "conflict" | "missing" | "signed-out" | "lock-lost" | "outcome-unknown" | "failed";
    };

/** Page source with its frontmatter's visibility line and trailing whitespace taken out; the body is otherwise as written. */
function withoutVisibility(markdown: string) {
  return markdown
    .trimEnd()
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, (frontmatter) =>
      frontmatter.replace(/^visibility:.*(?:\r?\n|$)/m, ""),
    );
}

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

  const result = await api.savePage(base.page.id, fields.value, editLockToken);

  if (result.ok) {
    const page = result.value;

    // api_v2 kept only the visibility, so the saved version is what it stored, not what was sent
    if (!hiding) return { kind: "saved", base: { page, markdown } };
    const stored = { page, markdown: pageToMarkdown(page, categories) };

    return base.page.pending_revision
      ? { kind: "saved", base: stored, discarded: true }
      : { kind: "saved", base: stored };
  }

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
      return {
        kind: "forbidden",
        message: error.message ?? "You don’t have permission to save this change.",
      };
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
