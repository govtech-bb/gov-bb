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
 * A record's value as a detail's text (#3782): a number as written, true and
 * false as Yes and No, and a list's items joined by commas. Null for a value
 * with nothing to show: none at all, blank text or an empty list.
 */
export function detailText(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    const items = value.map(String).filter((item) => item !== "");
    return items.length > 0 ? items.join(", ") : null;
  }
  return String(value);
}

/**
 * The details of `record` a contact block shows: each of the block's `fields`
 * labelled as its collection labels it, in the block's order. A field the
 * collection doesn't have, or the record leaves empty, is left out. A value
 * that isn't text is shown as text (`detailText`), and only text links. A
 * link that fails the content URL check is shown as text.
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
    const text = detailText(value);
    if (label === undefined || text === null) return [];
    // A list of phone numbers joined by commas is no one number to dial
    const link = typeof value === "string" ? contactLink(field, text) : null;
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
