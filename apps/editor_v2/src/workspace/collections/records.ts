import type { Collection, CollectionRecord, RecordInput } from "../../api/client";

/** A record's values as its dialog edits them, by field key; a field it doesn't hold is blank. */
export type RecordValues = CollectionRecord["data"];

// api_v2's record key: lower-case words joined by single hyphens
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const KEY_MAX = 200;

/** The values a record's dialog opens with, its key among them: none for a new record. */
export const recordValues = (collection: Collection, record?: CollectionRecord): RecordValues =>
  record ? { ...record.data, [collection.record_key]: record.record_key } : {};

/** Why a new record's key can't be used, or undefined when it can. */
export function keyProblem(key: string) {
  if (!key) return "Enter a key";

  if (key.length > KEY_MAX) return `Keep the key to ${KEY_MAX} characters or fewer`;

  if (!KEY.test(key))
    return "Use only lower-case letters, numbers and single hyphens between words";

  return undefined;
}

/**
 * What saving sends: the whole record, which replaces the stored one. A blank field is left out, so clearing it
 * removes its value. A value for a field the collection no longer lists is left out too, since api_v2 refuses it: the
 * dialog says so before saving (`droppedFields`).
 */
export function recordData(collection: Collection, values: RecordValues): RecordInput["data"] {
  const data: RecordValues = {};

  for (const { key } of collection.schema.fields) {
    const value = values[key]?.trim();

    if (value) data[key] = value;
  }

  return data;
}

/** The fields a record holds a value for that its collection no longer lists, which saving removes. */
export const droppedFields = (collection: Collection, record?: CollectionRecord) =>
  Object.keys(record?.data ?? {}).filter(
    (key) => !collection.schema.fields.some((field) => field.key === key),
  );

/** Whether the dialog's values differ from a record's, as when a newer version of it was saved meanwhile. */
export function valuesDiffer(
  collection: Collection,
  values: RecordValues,
  record: CollectionRecord,
) {
  const saved = recordValues(collection, record);

  return collection.schema.fields.some(
    (field) => (values[field.key] ?? "").trim() !== (saved[field.key] ?? ""),
  );
}

/** The records with this one, as the content API just saved it, in record key order. */
export const withRecord = (records: readonly CollectionRecord[], saved: CollectionRecord) =>
  [...records.filter((record) => record.record_key !== saved.record_key), saved].toSorted((a, b) =>
    a.record_key < b.record_key ? -1 : a.record_key > b.record_key ? 1 : 0,
  );
