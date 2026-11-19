/** A history screen's address: `service` is the service it was opened from, for the way back. */
export type HistorySearch = { service?: string };

/** Keeps a non-empty `service` from the address, and drops anything else. */
export function parseHistorySearch(search: { readonly service?: unknown }): HistorySearch {
  const { service } = search;

  return String(service) === service && service ? { service } : {};
}
