import type { Category } from "../api/categories";
import {
  ApiFailure,
  outcomeUnknown,
  type EditorApi,
  type FieldError,
  type SavePageInput,
} from "../api/client";
import { apiMessage } from "../api/failure-messages";
import { markdownToPageSaveInput, pageToMarkdown } from "../api/page-markdown";
import type { ServerPageBaseline } from "./page-session";

export type PageSaveOutcome =
  | { kind: "saved"; base: ServerPageBaseline; discarded?: true }
  | { kind: "invalid"; errors: readonly FieldError[] }
  | { kind: "forbidden" | "refused"; message: string }
  | { kind: "conflict" | "missing" | "signed-out" | "unknown" };

/** Exact normalized request and original baseline retained until its outcome is resolved. */
export type PageSaveAttempt = {
  base: ServerPageBaseline;
  markdown: string;
  fields: SavePageInput;
  categories: readonly Category[];
  hiding: boolean;
};

function withoutVisibility(markdown: string) {
  return markdown
    .trimEnd()
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, (frontmatter) =>
      frontmatter.replace(/^visibility:.*(?:\r?\n|$)/m, ""),
    );
}

/** Convert once, before dispatch; retries never reinterpret text against newer categories. */
export function preparePageSave(
  base: ServerPageBaseline,
  markdown: string,
  categories: readonly Category[],
): { ok: true; attempt: PageSaveAttempt } | { ok: false; outcome: PageSaveOutcome } {
  const fields = markdownToPageSaveInput(markdown, base.page, categories);

  if (!fields.ok) return { ok: false, outcome: { kind: "invalid", errors: fields.errors } };
  const hiding = base.page.visibility === "public" && fields.value.visibility !== "public";

  if (hiding && withoutVisibility(markdown) !== withoutVisibility(base.markdown))
    return {
      ok: false,
      outcome: {
        kind: "invalid",
        errors: [
          {
            field: "visibility",
            message: "Save your other changes before you change who can see the page",
          },
        ],
      },
    };

  return {
    ok: true,
    attempt: structuredClone({ base, markdown, categories, fields: fields.value, hiding }),
  };
}

/** Send or retry the frozen request without changing its expected version. */
export async function sendPageSave(
  api: Pick<EditorApi, "savePage">,
  sent: PageSaveAttempt,
): Promise<PageSaveOutcome> {
  try {
    const page = await api.savePage(sent.base.page.id, sent.fields, sent.base.page.version);

    const base = {
      page,
      markdown: sent.hiding ? pageToMarkdown(page, sent.categories) : sent.markdown,
    };

    if (sent.hiding && sent.base.page.pending_revision)
      return { kind: "saved", base, discarded: true };

    return { kind: "saved", base };
  } catch (error) {
    if (outcomeUnknown(error)) return { kind: "unknown" };

    if (!(error instanceof ApiFailure)) throw error;

    switch (error.status) {
      case 422:
        return { kind: "invalid", errors: error.errors };
      case 409:
        return error.code === "version_conflict"
          ? { kind: "conflict" }
          : {
              kind: "refused",
              message:
                apiMessage(error) ?? "This change cannot be saved in its current review state.",
            };
      case 404:
        return { kind: "missing" };
      case 401:
        return { kind: "signed-out" };
      case 403:
        return {
          kind: "forbidden",
          message: apiMessage(error) ?? "You don’t have permission to save this change.",
        };
      default:
        return {
          kind: "refused",
          message: apiMessage(error) ?? "This request could not be saved.",
        };
    }
  }
}

/** Validate and save a new draft attempt; the host retains prepared attempts for uncertain retries. */
export async function savePageDraft(
  api: Pick<EditorApi, "savePage">,
  base: ServerPageBaseline,
  markdown: string,
  categories: readonly Category[],
): Promise<PageSaveOutcome> {
  const prepared = preparePageSave(base, markdown, categories);

  return prepared.ok ? sendPageSave(api, prepared.attempt) : prepared.outcome;
}
