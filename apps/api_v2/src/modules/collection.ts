/**
 * Data collections (#3183): facts many pages repeat, such as a department's
 * phone number, kept once as records of a collection.
 *
 * A collection is `{ key, title, record_key, schema: { fields } }`, and each
 * field `{ key, label, type }`. editor_v2 and landing read collections in this
 * shape through the API; govbbmarkd's contact details need only each field's
 * key and label.
 */

import { z } from "zod";
import { EditVersion } from "./edit-concurrency";
import type { FieldError } from "./page";
import { err, ok, type Result } from "./result";

const key = (max: number) =>
  z
    .string()
    .max(max)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and hyphens.",
    );

/** A collection's name in urls and in a block that reads it, such as `contacts`. */
export const CollectionKey = key(100);
/** A record's name within its collection, such as `barbados-drug-service`. */
export const RecordKey = key(200);

/** The kinds of value a field holds; every one is a string. */
export const FIELD_TYPES = ["text", "slug", "email"] as const;

export const CollectionField = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES),
});
/** One field of a collection: its key in a record, the label readers see and the kind of value it holds. */
export type CollectionField = z.infer<typeof CollectionField>;

export const CollectionSchema = z.object({ fields: z.array(CollectionField) });
/** The field list a collection's records are checked against. */
export type CollectionSchema = z.infer<typeof CollectionSchema>;

/** A record as stored: a value for some or all of its collection's fields. */
export const RecordData = z.record(z.string(), z.string());
/** A record's values, by field key. */
export type RecordData = z.infer<typeof RecordData>;

/** Versions round-trip at the database's millisecond precision. */
const Stamp = z.iso.datetime({ offset: true, precision: 3 });

export const CollectionView = z.object({
  key: CollectionKey,
  title: z.string(),
  record_key: z
    .string()
    .describe("The field whose value is each record's `record_key`."),
  schema: CollectionSchema,
  schema_version: z.int().positive(),
  updated_at: Stamp,
});
/** A collection's definition. */
export type CollectionView = z.infer<typeof CollectionView>;

export const CollectionSummary = CollectionView.extend({
  record_count: z.int().nonnegative(),
});
/** A collection with how many records it holds, for the editor's list. */
export type CollectionSummary = z.infer<typeof CollectionSummary>;

export const CollectionRecord = z.object({
  record_key: RecordKey,
  data: RecordData,
  updated_at: Stamp.describe(
    "Content timestamp; authenticated editors use version for write preconditions.",
  ),
});
/** One record of a collection. */
export type CollectionRecord = z.infer<typeof CollectionRecord>;

/** Record baseline for authenticated reads and mutation acknowledgements. */
export const EditorCollectionRecord = CollectionRecord.extend({
  version: EditVersion,
});
export type EditorCollectionRecord = z.infer<typeof EditorCollectionRecord>;

/** A record with the definition its form is rendered from. */
export const RecordEnvelope = z.object({
  collection: CollectionView,
  record: EditorCollectionRecord,
});
export type RecordEnvelope = z.infer<typeof RecordEnvelope>;

/** What a record write sends; `data` is checked against the field list. */
export const RecordBody = z.strictObject({
  data: z
    .record(z.string(), z.unknown())
    .describe(
      "A value for each field to set, by field key. The record key field " +
        "is filled from the url when left out.",
    ),
});

const VALUE: Readonly<Record<CollectionField["type"], z.ZodType<string>>> = {
  text: z.string().trim().min(1).max(2000),
  slug: RecordKey,
  email: z.email(),
};
const EXPECTED: Readonly<Record<CollectionField["type"], string>> = {
  text: "Enter some text, up to 2000 characters.",
  slug: "Use lowercase letters, numbers and hyphens.",
  email: "Enter an email address.",
};

/**
 * Check a record against its collection's field list: every field it names
 * must be one of the collection's, with a value of that field's type, and its
 * record key field, when it sends one, must be the record key in the url.
 */
export function parseRecord(
  collection: Pick<CollectionView, "key" | "record_key" | "schema">,
  recordKey: string,
  data: Readonly<Record<string, unknown>>,
): Result<RecordData, RecordRejected> {
  const fields = new Map(
    collection.schema.fields.map((field) => [field.key, field]),
  );
  const errors: FieldError[] = [];
  const parsed: RecordData = {};
  for (const [name, value] of Object.entries(data)) {
    const field = fields.get(name);
    if (!field) {
      errors.push({
        field: name,
        message: `${name} is not a field of ${collection.key}.`,
      });
      continue;
    }
    const checked = VALUE[field.type].safeParse(value);
    if (!checked.success) {
      errors.push({ field: name, message: EXPECTED[field.type] });
      continue;
    }
    parsed[name] = checked.data;
  }
  const named = parsed[collection.record_key];
  if (named !== undefined && named !== recordKey)
    errors.push({
      field: collection.record_key,
      message: `${collection.record_key} must be the record key in the url, ${recordKey}.`,
    });
  if (errors.length > 0) return err(new RecordRejected(errors));
  return ok(
    fields.has(collection.record_key)
      ? { ...parsed, [collection.record_key]: recordKey }
      : parsed,
  );
}

/** There is no collection with this key. */
export class CollectionNotFound extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "CollectionNotFound" as const;
  constructor(readonly key: string) {
    super(`No collection ${key}.`);
  }
}

/** The collection has no record with this key. */
export class RecordNotFound extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "RecordNotFound" as const;
  constructor(collection: string, recordKey: string) {
    super(`No record ${recordKey} in ${collection}.`);
  }
}

/** A create named a record that is already there. */
export class RecordExists extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "RecordExists" as const;
  constructor(collection: string, recordKey: string) {
    super(`${collection} already has a record ${recordKey}.`);
  }
}

/** The record changed since the caller read it. */
export class RecordConflict extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "RecordConflict" as const;
  constructor() {
    super(
      "This record was changed somewhere else since you opened it. Reload to see the current version.",
    );
  }
}

/** The record's fields do not fit the collection's field list. */
export class RecordRejected extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "RecordRejected" as const;
  constructor(readonly errors: readonly FieldError[]) {
    super(errors.map((error) => error.message).join(" "));
  }
}

/**
 * What creating a collection sends (#3681). Only its shape is checked on the
 * way in; `parseNewCollection` checks the rules, so each refusal names the
 * field it is about.
 */
export const NewCollection = z.strictObject({
  key: z
    .string()
    .describe(
      "The collection's name in urls: lowercase letters, numbers and " +
        "hyphens, up to 100 characters. No other collection may have it.",
    ),
  title: z
    .string()
    .describe("What editors see it called, up to 200 characters."),
  record_key: z
    .string()
    .describe(
      "The key of the `slug` field whose value names each record in its url.",
    ),
  schema: z.strictObject({
    fields: z
      .array(
        z.strictObject({
          key: z.string().describe("Unique among the collection's fields."),
          label: z.string(),
          type: z
            .string()
            .describe(
              `One of ${FIELD_TYPES.map((type) => `\`${type}\``).join(", ")}.`,
            ),
        }),
      )
      .describe("At least one field."),
  }),
});
/** What creating a collection sends, before its rules are checked. */
export type NewCollection = z.infer<typeof NewCollection>;

/** A collection's definition as it is written: one that passed every rule. */
export type CollectionDefinition = Pick<
  CollectionView,
  "key" | "title" | "record_key" | "schema"
>;

/** The longest field key: the record key field's key is stored in `data_collections.record_key`. */
const FIELD_KEY_MAX = 100;
const TITLE_MAX = 200;

/**
 * Check a new collection against the rules: a key in the `CollectionKey`
 * format, a title, at least one field, each with a key no other field has, a
 * label and one of `FIELD_TYPES`, and a record key that names one of its
 * `slug` fields, since a record's key is a slug in its url.
 */
export function parseNewCollection(
  input: NewCollection,
): Result<CollectionDefinition, CollectionRejected> {
  const errors: FieldError[] = [];
  if (!CollectionKey.safeParse(input.key).success)
    errors.push({
      field: "key",
      message:
        "Use lowercase letters, numbers and hyphens, up to 100 characters.",
    });
  const title = input.title.trim();
  if (!title || title.length > TITLE_MAX)
    errors.push({
      field: "title",
      message: `Enter a title, up to ${TITLE_MAX} characters.`,
    });
  const fields: CollectionField[] = [];
  const seen = new Set<string>();
  input.schema.fields.forEach((field, index) => {
    const at = `schema.fields.${index}`;
    const key = field.key;
    if (!key.trim() || key !== key.trim() || key.length > FIELD_KEY_MAX)
      errors.push({
        field: `${at}.key`,
        message: `Enter a key without spaces at either end, up to ${FIELD_KEY_MAX} characters.`,
      });
    else if (seen.has(key))
      errors.push({
        field: `${at}.key`,
        message: `Another field already has the key ${key}.`,
      });
    seen.add(key);
    const label = field.label.trim();
    if (!label)
      errors.push({ field: `${at}.label`, message: "Enter a label." });
    const type = CollectionField.shape.type.safeParse(field.type);
    if (!type.success)
      errors.push({
        field: `${at}.type`,
        message: `Choose one of ${FIELD_TYPES.join(", ")}.`,
      });
    else fields.push({ key, label, type: type.data });
  });
  if (input.schema.fields.length === 0)
    errors.push({ field: "schema.fields", message: "Add at least one field." });
  const named = input.schema.fields.find(
    (field) => field.key === input.record_key,
  );
  // With no fields at all, the field list's own refusal says what to do
  if (!named) {
    if (input.schema.fields.length > 0)
      errors.push({
        field: "record_key",
        message: "Choose one of the collection's fields as the record key.",
      });
  } else if (named.type !== "slug")
    errors.push({
      field: "record_key",
      message:
        "The record key must be a slug field: its value names each record in its url.",
    });
  if (errors.length > 0) return err(new CollectionRejected(errors));
  return ok({
    key: input.key,
    title,
    record_key: input.record_key,
    schema: { fields },
  });
}

/** A new collection's definition breaks a rule. */
export class CollectionRejected extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "CollectionRejected" as const;
  constructor(readonly errors: readonly FieldError[]) {
    super(errors.map((error) => error.message).join(" "));
  }
}

/** A create named a collection that is already there. */
export class CollectionExists extends Error {
  /** Stable protocol-projection discriminator. */
  readonly _tag = "CollectionExists" as const;
  constructor(readonly key: string) {
    super(`There is already a collection ${key}.`);
  }
}
