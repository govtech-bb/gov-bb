import {
  ApiFailure,
  type ApiPage,
  type EditorApi,
  type RecordDetail,
  type SavePageInput,
} from "./client";
import type { Category } from "./categories";
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

/** Each migrated write's send, independent read-back and landed check. */
export const writes = {
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
