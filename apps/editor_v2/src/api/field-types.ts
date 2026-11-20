import type { Collection } from "./client";

/** The kind of value a collection field holds, as api_v2's spec lists them. */
export type FieldType = Collection["schema"]["fields"][number]["type"];

// What the editor calls each type. Keyed by api_v2's own list, so a type api_v2 adds fails the type check until it has
// a name here, and is then offered with the rest
const NAMES = {
  text: "Text",
  slug: "Slug",
  email: "Email address",
  number: "Number",
  boolean: "Yes or no",
  date: "Date",
  list: "List of text",
} satisfies Record<FieldType, string>;

/** Every field type a new collection's field can have, with its name, in api_v2's order. */
export const FIELD_TYPES = Object.entries(NAMES).map(([type, name]) => ({
  // SAFETY: NAMES has exactly the FieldType keys, which `satisfies` checks.
  type: type as FieldType,
  name,
}));
