import {
  ApiFailure,
  CategoryRefused,
  isText,
  type CategoryResult,
  type CreatePageInput,
  type ApiPage,
  type PageHistoryEntry,
  type ApiRevision,
  type EditorApi,
  type RecordDetail,
  type SavePageInput,
} from "./client";
import {
  holdsFields,
  inOrder,
  type Category,
  type CategoryFields,
  type CategoryOrder,
} from "./categories";
import { pageToMarkdown } from "./page-markdown";
import { apiMessage } from "./failure-messages";
import { valuesDiffer } from "./record-values";
import type { Write } from "./write-attempt";

/** The displayed definition and version, with the complete replacement values for a record write. */
export type RecordWrite = {
  collection: RecordDetail["collection"];
  record?: RecordDetail["record"];
  key: string;
  data: RecordDetail["record"]["data"];
};

type RecordDeletion = { collection: string; key: string; version: number };

async function readRecord(api: EditorApi, collection: string, key: string) {
  try {
    return await api.record(collection, key);
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 404) return undefined;
    throw error;
  }
}

/** The exact page version and submitted Markdown last loaded or saved in this session. */
export type ServerPageBaseline = { page: ApiPage; markdown: string };

/** Page conversion uses the displayed baseline and categories, never a newer background read. */
export type PageSaveRequest = {
  base: ServerPageBaseline;
  markdown: string;
  fields: SavePageInput;
  categories: readonly Category[];
  hiding: boolean;
};

/** Hiding a public page may discard its pending revision and restore its live content. */
export type PageSaveAnswer = { base: ServerPageBaseline; discarded?: true };

type PageSubmission = { base: ServerPageBaseline; categories: readonly Category[] };

type PageDeletion = { id: string; version: number };

/** A restore's first-press page version and newest displayed history number are separate guards. */
export type PageRestoreRequest = {
  pageId: string;
  versionNo: number;
  read: number;
  historyVersion: number;
  isPublic: boolean;
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Preserve dialog refusal precedence before classification drops HTTP status.
function pageDialogRefusal(error: unknown, creating: boolean): never {
  if (error instanceof ApiFailure && error.status > 0 && error.status < 500) {
    if (error.errors.length && (creating || ![401, 409].includes(error.status)))
      throw new ApiFailure(422, error.errors, apiMessage(error));

    if (error.status === 409 && error.code !== "version_conflict")
      throw new ApiFailure(409, [], apiMessage(error), "page_dialog_conflict");
  }

  throw error;
}

async function readPage(api: EditorApi, id: string) {
  try {
    return await api.page(id);
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 404) return undefined;
    throw error;
  }
}

function savedPage(page: ApiPage, sent: PageSaveRequest): PageSaveAnswer {
  const base = {
    page,
    markdown: sent.hiding ? pageToMarkdown(page, sent.categories) : sent.markdown,
  };

  return sent.hiding && sent.base.page.pending_revision ? { base, discarded: true } : { base };
}

/** Category fields and the displayed version, retained together until the write settles. */
export type CategorySaveRequest = { fields: CategoryFields; base?: Category };

/** A sibling group confirmed by a write answer or by reading its current order. */
export type CategoryOrderAnswer = { categories: Category[]; checked: boolean };

type CategoryDeletion = { id: string; version: number };

/** The delete dialog distinguishes a write answer from absence established by a read. */
type CategoryDeletionAnswer = { category?: Category; checked: boolean };

function categoryAnswer<Value>(result: CategoryResult<Value, Error>): Value {
  if (result.ok) return result.value;

  // The category dialogs have always used their own fallback for a malformed request.
  if (result.error instanceof CategoryRefused && result.error.status === 400)
    throw new CategoryRefused(400, "");
  throw result.error;
}

async function readCategories(api: EditorApi) {
  return categoryAnswer(await api.categories());
}

type RevisionRejection = { reviewed: ApiRevision; comment: string };

type RevisionPublication = { revision?: ApiRevision; page?: ApiPage };

async function readRevision(api: EditorApi, id: string) {
  try {
    return await api.revision(id);
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 404) return undefined;
    throw error;
  }
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Catch-boundary mapping; only an answered non-version 409 is a review-state refusal.
function reviewRefusal(error: unknown): never {
  // Review dialogs name validation fields only for 422; a malformed 400 keeps their generic refusal.
  if (error instanceof ApiFailure && error.status === 400 && error.code === "validation_failed")
    throw new ApiFailure(400, error.errors, apiMessage(error), "review_request_refused");

  // Preserve the review-state branch after the shared outcome drops HTTP status.
  if (error instanceof ApiFailure && error.status === 409 && error.code !== "version_conflict")
    throw new ApiFailure(409, error.errors, apiMessage(error), "review_state_conflict");
  throw error;
}

function reviewedFieldsMatch(found: ApiRevision["fields"], reviewed: ApiRevision) {
  // SAFETY: These keys come from the reviewed revision's validated PageFields object.
  const fields = Object.keys(reviewed.fields) as (keyof ApiRevision["fields"])[];

  return fields.every(
    (field) => JSON.stringify(found[field]) === JSON.stringify(reviewed.fields[field]),
  );
}

/** Each migrated write's send, independent read-back and landed check. */
export const writes = {
  restoreVersion: (api: EditorApi): Write<PageRestoreRequest, ApiPage | PageHistoryEntry[]> => ({
    send: async (sent) => {
      try {
        return await api.restoreVersion(sent.pageId, sent.versionNo, sent.read);
      } catch (error) {
        // History refreshes after every answered 409, not just version conflicts.
        if (
          error instanceof ApiFailure &&
          error.status === 409 &&
          error.code !== "version_conflict"
        )
          throw new ApiFailure(409, error.errors, apiMessage(error), "restore_conflict");
        throw error;
      }
    },
    readBack: (sent) => api.history(sent.pageId),
    landed: (found, sent) =>
      !sent.isPublic &&
      Array.isArray(found) &&
      found.some(
        (entry) =>
          entry.action === "reverted" &&
          entry.restored_from === sent.versionNo &&
          entry.version_no > sent.historyVersion,
      ),
  }),
  createPage: (api: EditorApi): Write<CreatePageInput, ApiPage> => ({
    send: async (sent) => {
      try {
        return await api.createPage(sent);
      } catch (error) {
        return pageDialogRefusal(error, true);
      }
    },
    readBack: async (sent) => {
      const list = sent.parent_id
        ? (await api.service(sent.parent_id)).pages
        : sent.category_id
          ? await api.services()
          : await api.sitePages();

      const candidate = list.find((item) => item.url === sent.url);

      if (!candidate || !isText(candidate.id)) return undefined;
      const page = await readPage(api, candidate.id);

      return page?.id === candidate.id ? page : undefined;
    },
    landed: (found, sent) =>
      !!found &&
      (sent.id === undefined || found.id === sent.id) &&
      found.pending_revision === null &&
      found.url === sent.url &&
      found.parent_id === (sent.parent_id ?? null) &&
      // api_v2 gives a sub-page that names no category its parent's, so the author sent nothing to compare.
      ((!!sent.parent_id && !sent.category_id) ||
        found.category_id === (sent.category_id ?? null)) &&
      found.title === sent.title &&
      found.description === (sent.description ?? null) &&
      found.visibility === (sent.visibility ?? "draft") &&
      found.form_id === (sent.form_id ?? null) &&
      found.body_markdown === sent.body_markdown &&
      JSON.stringify(found.frontmatter) === JSON.stringify(sent.frontmatter ?? {}),
  }),
  deletePage: (api: EditorApi): Write<PageDeletion, ApiPage | undefined> => ({
    send: async (sent) => {
      try {
        await api.deletePage(sent.id, sent.version);

        return undefined;
      } catch (error) {
        return pageDialogRefusal(error, false);
      }
    },
    readBack: (sent) => readPage(api, sent.id),
    landed: (found) => found === undefined,
  }),
  publishRevision: (api: EditorApi): Write<ApiRevision, RevisionPublication> => ({
    send: async (reviewed) => {
      try {
        return { page: await api.publishRevision(reviewed.page_id, reviewed.version) };
      } catch (error) {
        return reviewRefusal(error);
      }
    },
    readBack: async (reviewed) => ({
      revision: await readRevision(api, reviewed.page_id),
      page: await readPage(api, reviewed.page_id),
    }),
    landed: (found, reviewed) =>
      !!found?.page &&
      !found.revision &&
      found.page.id === reviewed.page_id &&
      found.page.version > reviewed.version &&
      found.page.pending_revision === null &&
      found.page.visibility === "public" &&
      // A discarded/no-op revision can leave the already-matching live page unchanged.
      found.page.updated_at !== reviewed.live_updated_at &&
      reviewedFieldsMatch(found.page, reviewed),
  }),
  rejectRevision: (api: EditorApi): Write<RevisionRejection, ApiRevision> => ({
    send: async (sent) => {
      try {
        return await api.rejectRevision(sent.reviewed.page_id, sent.comment, sent.reviewed.version);
      } catch (error) {
        return reviewRefusal(error);
      }
    },
    readBack: (sent) => readRevision(api, sent.reviewed.page_id),
    landed: (found, sent) =>
      !!found &&
      found.id === sent.reviewed.id &&
      found.page_id === sent.reviewed.page_id &&
      found.version > sent.reviewed.version &&
      found.status === "rejected" &&
      found.comment === sent.comment &&
      reviewedFieldsMatch(found.fields, sent.reviewed),
  }),
  createCategory: (api: EditorApi): Write<CategorySaveRequest, Category> => ({
    send: async (sent) => categoryAnswer(await api.createCategory(sent.fields)),
    readBack: async (sent) =>
      (await readCategories(api)).find((category) => category.slug === sent.fields.slug),
    landed: (found, sent) => !!found && holdsFields(found, sent.fields),
  }),
  saveCategory: (api: EditorApi): Write<CategorySaveRequest, Category> => ({
    send: async (sent) => {
      if (!sent.base) throw new Error("Category save requires the displayed version.");

      return categoryAnswer(await api.updateCategory(sent.base.id, sent.fields, sent.base.version));
    },
    readBack: async (sent) =>
      (await readCategories(api)).find((category) => category.id === sent.base?.id),
    // api_v2 returns the existing version for an exact no-op.
    landed: (found, sent) =>
      !!found && found.id === sent.base?.id && holdsFields(found, sent.fields),
  }),
  deleteCategory: (api: EditorApi): Write<CategoryDeletion, CategoryDeletionAnswer> => ({
    send: async (sent) => {
      categoryAnswer(await api.deleteCategory(sent.id, sent.version));

      return { checked: false };
    },
    readBack: async (sent) => ({
      category: (await readCategories(api)).find((category) => category.id === sent.id),
      checked: true,
    }),
    landed: (found) => !!found && found.checked && !found.category,
  }),
  orderCategories: (api: EditorApi): Write<CategoryOrder, CategoryOrderAnswer> => ({
    send: async (sent) => ({
      categories: categoryAnswer(await api.orderCategories(sent)),
      checked: false,
    }),
    readBack: async (sent) => ({
      categories: (await readCategories(api)).filter(
        (category) => category.parent_id === sent.parent_id,
      ),
      checked: true,
    }),
    landed: (found, sent) => !!found && inOrder(found.categories, sent),
  }),
  savePage: (api: EditorApi): Write<PageSaveRequest, PageSaveAnswer> => ({
    send: async (sent) => {
      try {
        return savedPage(
          await api.savePage(sent.base.page.id, sent.fields, sent.base.page.version),
          sent,
        );
      } catch (error) {
        // Preserve the page's review-state fallback before classification drops the HTTP status.
        if (
          error instanceof ApiFailure &&
          error.status === 409 &&
          error.code !== "version_conflict" &&
          apiMessage(error) === undefined
        )
          throw new ApiFailure(
            409,
            error.errors,
            "This change cannot be saved in its current review state.",
            error.code,
          );
        throw error;
      }
    },
    readBack: async (sent) => {
      const page = await readPage(api, sent.base.page.id);

      return page && savedPage(page, sent);
    },
    landed: (found, sent) => {
      if (!found) return false;
      const page = found.base.page;
      const drafted = sent.base.page.visibility === "public" && sent.fields.visibility === "public";

      const review = drafted
        ? sent.base.page.pending_revision?.status === "submitted"
          ? "submitted"
          : "draft"
        : null;

      return (
        page.version !== sent.base.page.version &&
        (page.pending_revision?.status ?? null) === review &&
        (sent.hiding
          ? page.visibility === sent.fields.visibility
          : pageToMarkdown(page, sent.categories) === sent.markdown)
      );
    },
  }),
  submitRevision: (api: EditorApi): Write<PageSubmission, ServerPageBaseline> => ({
    send: async (sent) => {
      const revision = await api.submitRevision(sent.base.page.id, sent.base.page.version);

      return {
        page: {
          ...sent.base.page,
          version: revision.version,
          updated_at: revision.updated_at,
          pending_revision: { status: revision.status, comment: revision.comment },
        },
        markdown: sent.base.markdown,
      };
    },
    readBack: async (sent) => {
      const page = await readPage(api, sent.base.page.id);

      return page && { page, markdown: sent.base.markdown };
    },
    landed: (found, sent) =>
      !!found &&
      found.page.version !== sent.base.page.version &&
      found.page.pending_revision?.status === "submitted" &&
      pageToMarkdown(found.page, sent.categories) === sent.base.markdown,
  }),
  createRecord: (api: EditorApi): Write<RecordWrite, RecordDetail> => ({
    send: async (sent) => ({
      collection: sent.collection,
      record: await api.createRecord(sent.collection.key, sent.key, sent.data),
    }),
    readBack: (sent) => readRecord(api, sent.collection.key, sent.key),
    landed: (found, sent) => !!found && !valuesDiffer(sent.collection, sent.data, found.record),
  }),
  saveRecord: (api: EditorApi): Write<RecordWrite, RecordDetail> => ({
    send: (sent) => {
      if (!sent.record) throw new Error("Record save requires the displayed version.");

      return api.saveRecord(sent.collection.key, sent.key, sent.data, sent.record.version);
    },
    readBack: (sent) => readRecord(api, sent.collection.key, sent.key),
    landed: (found, sent) =>
      !!found &&
      !!sent.record &&
      found.record.version !== sent.record.version &&
      !valuesDiffer(sent.collection, sent.data, found.record),
  }),
  deleteRecord: (api: EditorApi): Write<RecordDeletion, RecordDetail | undefined> => ({
    send: async (sent) => {
      await api.deleteRecord(sent.collection, sent.key, sent.version);

      return undefined;
    },
    readBack: (sent) => readRecord(api, sent.collection, sent.key),
    landed: (found) => found === undefined,
  }),
};
