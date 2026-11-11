import { ApiFailure, type EditorApi, type RecordDetail } from "./client";
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

/** The record writes' send, read-back and landed checks; entries are added as screens migrate. */
export const writes = {
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
