import { isText, type Collection, type CollectionRecord } from "../../api/client";

/** A record's values as its dialog edits them, by field key; a field it doesn't hold is blank. */
export type RecordValues = CollectionRecord["data"];

/** One value a record holds: text, a number, true or false, or a list of text. */
export type RecordValue = RecordValues[string];

type FieldType = Collection["schema"]["fields"][number]["type"];

// A number as an editor types one, or as a stored one opens: digits, with an optional sign, decimal point and exponent
// (a very small rate opens as 1e-7). Anything else, such as 1,000, is sent as typed for api_v2 to refuse with its own
// message
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * What a date box holds while its date is incomplete or impossible, such as 31/02, where the browser reports no value.
 * It is sent as typed, so api_v2 refuses it on the field rather than saving the record without its date.
 */
export const INCOMPLETE_DATE = "incomplete date";

/** A value as text, for a table cell or a text box: a list's items joined, true and false as Yes and No. */
export function valueText(value: RecordValue | undefined): string {
  if (value === undefined) return "";

  if (value === true || value === false) return value ? "Yes" : "No";

  if (Array.isArray(value)) return value.join(", ");

  return String(value);
}

/** A key field's value, which is always text. */
export const keyText = (value: RecordValue | undefined) => (isText(value) ? value : "");

// api_v2's record key: lower-case words joined by single hyphens
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const KEY_MAX = 200;

/** The values a record's dialog opens with, its key among them: none for a new record. */
export function recordValues(collection: Collection, record?: CollectionRecord): RecordValues {
  if (!record) return {};
  const values: RecordValues = { ...record.data, [collection.record_key]: record.record_key };

  // A number is edited as the text of its box
  for (const { key, type } of collection.schema.fields)
    if (type === "number" && Number.isFinite(values[key])) values[key] = String(values[key]);

  return values;
}

/** Why a new record's key can't be used, or undefined when it can. */
export function keyProblem(key: string) {
  if (!key) return "Enter a key";

  if (key.length > KEY_MAX) return `Keep the key to ${KEY_MAX} characters or fewer`;

  if (!KEY.test(key))
    return "Use only lower-case letters, numbers and single hyphens between words";

  return undefined;
}

/** A field's value as saving sends it, or undefined when it is blank and left out. */
function savedValue(type: FieldType, value: RecordValue | undefined): RecordValue | undefined {
  // A box nobody ticked or unticked is left out, so a record never says no on nobody's word
  if (type === "boolean") return value === undefined ? undefined : value === true;

  if (Array.isArray(value)) {
    const items = value.map((item) => item.trim()).filter(Boolean);

    return items.length > 0 ? items : undefined;
  }

  if (!isText(value)) return value;
  const text = value.trim();

  if (!text) return undefined;

  return type === "number" && NUMBER.test(text) ? Number(text) : text;
}

/**
 * What saving sends: the whole record, which replaces the stored one. A blank field, or a list with no items, is left
 * out, so clearing it removes its value; a yes-or-no field is sent once it holds a value or its box has been ticked or
 * unticked. A number is sent as a number. A value for a
 * field the collection no longer lists is left out too, since api_v2 refuses it: the dialog says so before saving
 * (`droppedFields`).
 */
export function recordData(collection: Collection, values: RecordValues): RecordValues {
  const data: RecordValues = {};

  for (const { key, type } of collection.schema.fields) {
    const value = savedValue(type, values[key]);

    if (value !== undefined) data[key] = value;
  }

  return data;
}

/** The fields a record holds a value for that its collection no longer lists, which saving removes. */
export const droppedFields = (collection: Collection, record?: CollectionRecord) =>
  Object.keys(record?.data ?? {}).filter(
    (key) => !collection.schema.fields.some((field) => field.key === key),
  );

/** The records with this one, as the content API just saved it, in record key order. */
export const withRecord = (records: readonly CollectionRecord[], saved: CollectionRecord) =>
  [...records.filter((record) => record.record_key !== saved.record_key), saved].toSorted((a, b) =>
    a.record_key < b.record_key ? -1 : a.record_key > b.record_key ? 1 : 0,
  );
