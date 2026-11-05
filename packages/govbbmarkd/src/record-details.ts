import { isSafeContentUrl } from "./content-url";

/**
 * A record's details as a page shows them, without React: a contact block's
 * tiles (`::contact`) and a fact in a line of text (`:fact`).
 *
 * The editor and landing each show them in their own markup. What a detail
 * says, what it is labelled, and whether it is a link (and to where) is
 * decided once, here, so the two cannot drift.
 */

/** One detail of a record, ready to show. */
export interface RecordDetail {
  field: string;
  label: string;
  text: string;
  /** Where the detail links to, already through `isSafeContentUrl`; null when it is not a link. */
  href: string | null;
}

/** A collection's fields, as the API describes them: enough to label a record's details. */
export interface CollectionFields {
  schema: { fields: ReadonlyArray<{ key: string; label: string }> };
}

/**
 * A detail that is really a link. Phone numbers and email addresses are
 * actionable on a phone, and a citizen reading this on one should be able to
 * tap rather than transcribe.
 *
 * Derived from the field name rather than stored, because the alternative is
 * asking an author to declare that `phone` is a telephone number, which they
 * would get wrong exactly as often as the naming convention would.
 */
export function detailLink(field: string, value: string): string | null {
  if (field.includes("phone") || field.includes("telephone")) {
    return `tel:${value.replace(/[^\d+]/g, "")}`;
  }
  if (field.includes("email")) return `mailto:${value}`;
  if (field.includes("website") || field.includes("url")) {
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  }
  return null;
}

/**
 * The details of `record` a page shows: each of `fields` labelled as its
 * collection labels it, in that order. A field the
 * collection doesn't have, or the record leaves empty, is left out. A link
 * that fails the content URL check is shown as text.
 */
export function recordDetails(
  collection: CollectionFields,
  fields: readonly string[],
  record: Record<string, unknown>,
): RecordDetail[] {
  const labels = new Map(
    collection.schema.fields.map((field) => [field.key, field.label]),
  );
  return fields.flatMap((field) => {
    const label = labels.get(field);
    const value = record[field];
    if (
      label === undefined ||
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return [];
    }
    const text = String(value);
    const link = detailLink(field, text);
    return [
      {
        field,
        label,
        text,
        href: link !== null && isSafeContentUrl(link) ? link : null,
      },
    ];
  });
}
