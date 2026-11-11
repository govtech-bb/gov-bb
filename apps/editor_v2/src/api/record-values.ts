import type { Collection, CollectionRecord } from "./client";

/** Compare listed record fields, ignoring surrounding input spaces and treating missing values as blank. */
export function valuesDiffer(
  collection: Collection,
  values: CollectionRecord["data"],
  record: CollectionRecord,
) {
  const saved = { ...record.data, [collection.record_key]: record.record_key };

  return collection.schema.fields.some(
    (field) => (values[field.key] ?? "").trim() !== (saved[field.key] ?? ""),
  );
}
