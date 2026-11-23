import type { FieldError, NewCollectionInput } from "../../api/client";
import type { FieldType } from "../../api/field-types";
import { slugify } from "../../api/slug";

/** One field of a new collection as its dialog edits it; `id` keeps a row's place as rows come and go. */
export type FieldRow = {
  id: number;
  key: string;
  label: string;
  type: FieldType;
};

/**
 * A new collection as its dialog holds it. Its key follows its title until the author types one; `recordKey` is the
 * id of the row whose value names each record.
 */
export type CollectionDraft = {
  title: string;
  key?: string;
  fields: readonly FieldRow[];
  recordKey?: number;
};

// api_v2's collection key: lower-case words joined by single hyphens
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const KEY_MAX = 100;

const TITLE_MAX = 200;

// The record key field's key is stored where a collection key is, so a field key is held to the same length
const FIELD_KEY_MAX = 100;

/** The key the draft will be created with: the one typed, or its title's. */
export const draftKey = (draft: CollectionDraft) => draft.key ?? slugify(draft.title, KEY_MAX);

/** What creating the draft sends, its words without the spaces around them. */
export function newCollectionInput(draft: CollectionDraft): NewCollectionInput {
  const named = draft.fields.find((row) => row.id === draft.recordKey);

  return {
    key: draftKey(draft),
    title: draft.title.trim(),
    record_key: named?.key.trim() ?? "",
    schema: {
      fields: draft.fields.map(({ key, label, type }) => ({
        key: key.trim(),
        label: label.trim(),
        type,
      })),
    },
  };
}

/**
 * Why the content API would refuse this collection, found before it's sent, each named by the path api_v2 names that
 * field with: `key`, `title`, `schema.fields`, `schema.fields.1.key` and `record_key`. `taken` is the keys the
 * collections already have.
 */
export function collectionProblems(
  input: NewCollectionInput,
  taken: readonly string[],
): FieldError[] {
  const problems: FieldError[] = [];
  const problem = (field: string, message: string) => problems.push({ field, message });

  if (!input.key) problem("key", "Enter a key");
  else if (input.key.length > KEY_MAX)
    problem("key", `Keep the key to ${KEY_MAX} characters or fewer`);
  else if (!KEY.test(input.key))
    problem("key", "Use only lower-case letters, numbers and single hyphens between words");
  else if (taken.includes(input.key)) problem("key", "Another collection already has this key");

  if (!input.title) problem("title", "Enter a title");
  else if (input.title.length > TITLE_MAX)
    problem("title", `Keep the title to ${TITLE_MAX} characters or fewer`);

  if (input.schema.fields.length === 0) problem("schema.fields", "Add at least one field");
  const seen = new Set<string>();

  input.schema.fields.forEach((field, index) => {
    const at = `schema.fields.${index}`;

    if (!field.key) problem(`${at}.key`, "Enter a key");
    else if (field.key.length > FIELD_KEY_MAX)
      problem(`${at}.key`, `Keep the key to ${FIELD_KEY_MAX} characters or fewer`);
    else if (!KEY.test(field.key))
      problem(`${at}.key`, "Use only lower-case letters, numbers and single hyphens between words");
    else if (seen.has(field.key)) problem(`${at}.key`, "Another field already has this key");
    seen.add(field.key);

    if (!field.label) problem(`${at}.label`, "Enter a label");
  });

  const named = input.schema.fields.find((field) => field.key === input.record_key);

  if (input.schema.fields.length > 0 && (!input.record_key || !named))
    problem("record_key", "Choose the field that names each record");
  else if (named && named.type !== "slug")
    problem("record_key", "Choose a slug field: its value names each record in its address");

  return problems;
}
