import { isSafeContentUrl } from "./content-url";

/**
 * A `::contact{collection record fields}` block's details, without React.
 *
 * The editor's preview and landing's page both show a contact block, each in
 * its own markup. What a detail says, what it is labelled, and whether it is
 * a link (and to where) is decided once, here, so the two cannot drift.
 */

/** One detail of a contact record, ready to show. */
export interface ContactDetail {
  field: string;
  label: string;
  text: string;
  /** Where the detail links to, already through `isSafeContentUrl`; null when it is not a link. */
  href: string | null;
}

/** A collection's fields, as the API describes them: enough to label a record's details. */
export interface ContactCollection {
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
export function contactLink(field: string, value: string): string | null {
  if (field.includes("phone") || field.includes("telephone")) {
    const number = value.replace(/[^\d+]/g, "");
    return `tel:${/^246\d{7}$/.test(number) ? `+1${number}` : number}`;
  }
  if (field.includes("email")) return `mailto:${value}`;
  if (field.includes("website") || field.includes("url")) {
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  }
  return null;
}

/**
 * The details of `record` a contact block shows: each of the block's `fields`
 * labelled as its collection labels it, in the block's order. A field the
 * collection doesn't have, or the record leaves empty, is left out. A link
 * that fails the content URL check is shown as text.
 */
export function contactDetails(
  collection: ContactCollection,
  fields: readonly string[],
  record: Record<string, unknown>,
): ContactDetail[] {
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
    const link = contactLink(field, text);
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
