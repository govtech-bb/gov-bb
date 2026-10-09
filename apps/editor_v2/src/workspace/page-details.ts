import type { ApiPage, DraftFields, FieldError, SaveFields } from "../api/client";

/** A page's details as the content API keeps them: everything a save sends except the body. */
export type PageDetails = Omit<SaveFields, "body_markdown" | "parent_id">;

/** A page's details on the server. A sub-page is filed with the page above it, so it names no category. */
export function detailsOf(page: ApiPage): PageDetails {
  return {
    url: page.url,
    category_id: page.parent_id === null ? page.category_id : null,
    title: page.title,
    description: page.description,
    visibility: page.visibility,
    form_id: page.form_id,
    frontmatter: page.frontmatter,
  };
}

/** The details a saved draft holds. */
export const detailsOfDraft = ({
  url,
  category_id,
  title,
  description,
  visibility,
  form_id,
  frontmatter,
}: DraftFields): PageDetails => ({
  url,
  category_id,
  title,
  description,
  visibility,
  form_id,
  frontmatter,
});

const byKey = <Value>([a]: [string, Value], [b]: [string, Value]) => a.localeCompare(b);

/** Details as text two equal copies share, whatever order their keys were written in. */
const comparable = (details: PageDetails) =>
  JSON.stringify(
    Object.entries({
      ...details,
      frontmatter: Object.entries(details.frontmatter).sort(byKey),
    }).sort(byKey),
  );

export const sameDetails = (a: PageDetails, b: PageDetails) => comparable(a) === comparable(b);

/** Details with a new introduction; an empty one is removed rather than kept as blank. */
export function withLede(details: PageDetails, lede: string): PageDetails {
  const frontmatter = { ...details.frontmatter };

  if (lede) frontmatter.lede = lede;
  else delete frontmatter.lede;

  return { ...details, frontmatter };
}

/** A published page keeps its path, so whatever path a draft holds gives way to the stored one. */
export function keepPublishedPath(details: PageDetails, page: ApiPage): PageDetails {
  return page.published_at !== null && details.url !== page.url
    ? { ...details, url: page.url }
    : details;
}

/**
 * A service's entry page is filed under a category. That is the editor's rule,
 * since the content API also keeps pages that are not services; the API
 * words every other refusal itself.
 */
export function detailsProblems(details: PageDetails, entry: boolean): FieldError[] {
  return entry && !details.category_id ? [{ field: "category", message: "Choose a category" }] : [];
}
