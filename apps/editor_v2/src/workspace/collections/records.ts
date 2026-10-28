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
 * removes its value. A value for a field the collection no longer lists goes back as it came, for the content API to
 * keep or refuse, rather than being dropped unseen.
 */
export function recordData(
  collection: Collection,
  values: RecordValues,
  record?: CollectionRecord,
): RecordInput["data"] {
  const listed = new Set(collection.schema.fields.map((field) => field.key));
  const data: RecordValues = {};

  for (const [key, value] of Object.entries(record?.data ?? {}))
    if (!listed.has(key)) data[key] = value;

  for (const key of listed) {
    const value = values[key]?.trim();

    if (value) data[key] = value;
  }

  return data;
}

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
