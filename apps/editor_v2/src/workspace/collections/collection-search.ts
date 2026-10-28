/** A collection screen's address: `record` names the record whose dialog is open. */
export type CollectionSearch = { record?: string };

/**
 * Keeps a non-empty `record` from the address, and drops anything else. The router reads a search value as JSON, so a
 * key of digits, such as `?record=2024`, arrives as a number and is turned back into its text.
 */
export function parseCollectionSearch(search: { readonly record?: unknown }): CollectionSearch {
  const { record } = search;
  const text = Number.isFinite(record) ? String(record) : record;

  return String(text) === text && text ? { record: text } : {};
}
