/**
 * A page's address, composed rather than typed.
 *
 * Editing `url` as one free-text field does not scale: the category and the
 * service are shared taxonomy that dozens of pages agree on, and retyping
 * them per page is how a service ends up living at two spellings of its own
 * name. Only the last segment is genuinely per-page.
 *
 * So the address is three parts — a category from the canonical taxonomy, a
 * service, and a path — and `url` is derived from them.
 *
 * One seeded page does not fit: `/bank-holiday-calendar` has no category at
 * all. That is not a bug in the page, it is a real shape — some content is
 * island-wide rather than belonging to a service area — so a category is
 * optional here and the findings record that a two-level taxonomy cannot
 * describe every page.
 */

export interface PageAddress {
  /** A slug from the canonical taxonomy, or "" for a top-level page. */
  category: string;
  service: string;
  /** Everything after the service. May contain a slash. */
  path: string;
}

export function buildUrl(address: PageAddress): string {
  const segments = [address.category, address.service, address.path]
    .map((segment) => segment.trim().replace(/^\/+|\/+$/g, ""))
    .filter((segment) => segment.length > 0);
  return `/${segments.join("/")}`;
}

/**
 * Take an existing url apart.
 *
 * The first segment is a category only when the taxonomy says so — which is
 * what keeps `/bank-holiday-calendar` from being read as a category with no
 * service.
 */
export function splitUrl(
  url: string,
  categorySlugs: ReadonlyArray<string>,
): PageAddress {
  const segments = url.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return { category: "", service: "", path: "" };

  const hasCategory = categorySlugs.includes(segments[0]);
  const category = hasCategory ? segments[0] : "";
  const rest = hasCategory ? segments.slice(1) : segments;

  return {
    category,
    service: rest[0] ?? "",
    path: rest.slice(1).join("/"),
  };
}

/** Every service segment already in use, for the service picker. */
export function servicesInUse(
  urls: ReadonlyArray<string>,
  categorySlugs: ReadonlyArray<string>,
): string[] {
  const found = new Set<string>();
  for (const url of urls) {
    const { service } = splitUrl(url, categorySlugs);
    if (service) found.add(service);
  }
  return [...found].sort();
}
