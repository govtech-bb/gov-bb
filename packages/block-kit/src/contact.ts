/**
 * The contact block's details, without React.
 *
 * The renderer here, landing and editor_v2 all show a contact block, each in
 * its own markup. What a detail says, what it is labelled, and whether it is
 * a link — and to where — is decided once, here, so the three cannot drift.
 */

import type { CollectionField, ContactBlock } from "./types";
import { safeHref } from "./href";

/** One detail of a contact record, ready to show. */
export interface ContactDetail {
  field: string;
  label: string;
  text: string;
  /** Where the detail links to, already through `safeHref`; null when it is not a link. */
  href: string | null;
}

/**
 * A detail that is really a link. Phone numbers and email addresses are
 * actionable on a phone, and a citizen reading this on one should be able to
 * tap rather than transcribe.
 *
 * Derived from the field name rather than stored, because the alternative is
 * asking an author to declare that `phone` is a telephone number — which they
 * would get wrong exactly as often as the naming convention would.
 */
export function contactLink(field: string, value: string): string | null {
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
 * The contact block a page's `::contact{collection record fields}` describes:
 * the record named directly, and each field labelled as its collection labels
 * it. The heading and wording around it stay the page's own, so the block's
 * title and description are empty. A field the collection doesn't have is
 * left out.
 */
export function contactBlockFor(
  definition: {
    key: string;
    schema: { fields: ReadonlyArray<Pick<CollectionField, "key" | "label">> };
  },
  record: string,
  fields: readonly string[],
): ContactBlock {
  const labels = new Map(
    definition.schema.fields.map((field) => [field.key, field.label]),
  );
  return {
    id: `${definition.key}/${record}`,
    type: "contact",
    title: "",
    description: [],
    collection: definition.key,
    record,
    fields: fields.flatMap((field) => {
      const label = labels.get(field);
      return label === undefined ? [] : [{ field, label }];
    }),
  };
}

/**
 * The details of `record` the block shows, in the block's order, skipping
 * any the record leaves empty. Links pass the same `safeHref` check as every
 * other link a document produces; one that fails it is shown as text.
 */
export function contactDetails(
  block: Pick<ContactBlock, "fields">,
  record: Record<string, unknown>,
): ContactDetail[] {
  return block.fields.flatMap(({ field, label }) => {
    const value = record[field];
    if (value === undefined || value === null || value === "") return [];
    const text = String(value);
    const link = contactLink(field, text);
    return [
      { field, label, text, href: link === null ? null : safeHref(link) },
    ];
  });
}
