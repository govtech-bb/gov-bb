/** The People screen's address: `person` names the person whose panel is open. */
export type PeopleSearch = { person?: string };

/**
 * Keeps a non-empty `person` id from the address, and drops anything else. The router reads a search value as JSON, so
 * an id of digits arrives as a number and is turned back into its text, as a collection's `record` is.
 */
export function parsePeopleSearch(search: { readonly person?: unknown }): PeopleSearch {
  const { person } = search;
  const text = Number.isFinite(person) ? String(person) : person;

  return String(text) === text && text ? { person: text } : {};
}
