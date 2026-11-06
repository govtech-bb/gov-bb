import type { Category } from "../api/categories";
import {
  ApiFailure,
  outcomeUnknown,
  type ApiPage,
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

/** The editor's baseline once api_v2 holds the attempt, from the page as api_v2 answered it. */
function savedAs(page: ApiPage, sent: PageSaveAttempt): PageSaveOutcome {
  const base = {
    page,
    markdown: sent.hiding ? pageToMarkdown(page, sent.categories) : sent.markdown,
  };

  if (sent.hiding && sent.base.page.pending_revision)
    return { kind: "saved", base, discarded: true };

  return { kind: "saved", base };
}

/**
 * Whether the page shows the attempt landed: moved past the version it was sent over, and standing as the attempt
 * would have left it. That's its text, or only its visibility when it hid the page, and the review state a save gives:
 * a save to a public page that stays public is a draft change for review, and any other save writes the page itself,
 * which then has no change waiting.
 */
export function saveLanded(page: ApiPage, sent: PageSaveAttempt) {
  const drafted = sent.base.page.visibility === "public" && sent.fields.visibility === "public";

  return (
    page.version !== sent.base.page.version &&
    (page.pending_revision?.status ?? null) === (drafted ? "draft" : null) &&
    (sent.hiding
      ? page.visibility === sent.fields.visibility
      : pageToMarkdown(page, sent.categories) === sent.markdown)
  );
}

/**
 * Retry a save whose answer was lost. When the page shows the first request landed, that is the save, confirmed: sent
 * again, it would only be refused as if someone else had changed the page. Otherwise the same request goes again.
 */
export async function retryPageSave(
  api: Pick<EditorApi, "page" | "savePage">,
  sent: PageSaveAttempt,
): Promise<PageSaveOutcome> {
  // Only a read that answers can show the save landed; without one the retry goes as it did before
  const page = await api.page(sent.base.page.id).catch(() => undefined);

  if (page && saveLanded(page, sent)) return savedAs(page, sent);

  return sendPageSave(api, sent);
}

/** Whether the page shows a submission landed: moved past the version it was sent over, waiting with its text. */
export const submissionLanded = (
  page: ApiPage,
  sent: ServerPageBaseline,
  categories: readonly Category[],
) =>
  page.version !== sent.page.version &&
  page.pending_revision?.status === "submitted" &&
  pageToMarkdown(page, categories) === sent.markdown;

/** The page a retried submission finds, if the first one landed. Undefined otherwise, and the retry submits again. */
export async function landedSubmission(
  api: Pick<EditorApi, "page">,
  sent: ServerPageBaseline,
  categories: readonly Category[],
) {
  const page = await api.page(sent.page.id).catch(() => undefined);

  return page && submissionLanded(page, sent, categories) ? page : undefined;
}

/** Send the frozen request without changing its expected version. */
export async function sendPageSave(
  api: Pick<EditorApi, "savePage">,
  sent: PageSaveAttempt,
): Promise<PageSaveOutcome> {
  try {
    return savedAs(
      await api.savePage(sent.base.page.id, sent.fields, sent.base.page.version),
      sent,
    );
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
