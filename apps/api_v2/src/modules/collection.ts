/**
 * Data collections (#3183): facts many pages repeat, such as a department's
 * phone number, kept once as records of a collection.
 *
 * A collection's field list is the shape of block-kit's
 * `CollectionDefinition` (`{ key, title, record_key, schema: { fields } }`),
 * so editor_v2 and landing can read it with those types. api_v2 keeps its own
 * Zod copy rather than importing block-kit, which would pull React into the
 * API's build.
 */

import { z } from "zod";
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
/** One field of a collection, as block-kit's `CollectionField`. */
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
    "Send it back in `if-updated-at` to save or delete this version.",
  ),
});
/** One record of a collection. */
export type CollectionRecord = z.infer<typeof CollectionRecord>;

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
