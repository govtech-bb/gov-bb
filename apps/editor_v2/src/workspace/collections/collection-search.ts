/** A collection screen's address: `record` names the record whose dialog is open. */
export type CollectionSearch = { record?: string };

/** Keeps a non-empty `record` from the address, and drops anything else. */
export function parseCollectionSearch(search: { readonly record?: unknown }): CollectionSearch {
  const { record } = search;

  return String(record) === record && record ? { record } : {};
}
