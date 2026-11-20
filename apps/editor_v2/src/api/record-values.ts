import { isText, type Collection, type CollectionRecord } from "./client";

type Value = CollectionRecord["data"][string] | undefined;

// A value as it compares: text and list items without surrounding spaces, and a blank value or an empty list as none
function compared(value: Value) {
  if (isText(value)) return value.trim() || undefined;

  if (Array.isArray(value)) {
    const items = value.map((item) => item.trim()).filter(Boolean);

    return items.length > 0 ? JSON.stringify(items) : undefined;
  }

  return value;
}

/** Compare listed record fields, ignoring surrounding input spaces and treating missing values as blank. */
export function valuesDiffer(
  collection: Collection,
  values: CollectionRecord["data"],
  record: CollectionRecord,
) {
  const saved = { ...record.data, [collection.record_key]: record.record_key };

  return collection.schema.fields.some(
    (field) => compared(values[field.key]) !== compared(saved[field.key]),
  );
}
