import type { ApiPage, FieldError, SaveFields } from "../api/client";
import { urlProblem } from "../api/page-markdown";

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

/** Every detail the content API would refuse, so the author can fix it before saving. */
export function detailsProblems(details: PageDetails, entry: boolean): FieldError[] {
  const errors: FieldError[] = [];

  if (!details.title) errors.push({ field: "title", message: "Enter a title" });
  else if (details.title.length > 300)
    errors.push({ field: "title", message: "Enter a title of 300 characters or fewer" });

  const badUrl = details.url ? urlProblem(details.url) : "Enter a path";

  if (badUrl) errors.push({ field: "url", message: badUrl });

  if (details.form_id && details.form_id.length > 100)
    errors.push({ field: "form_id", message: "Enter a form ID of 100 characters or fewer" });

  if (entry && !details.category_id)
    errors.push({ field: "category", message: "Choose a category" });

  return errors;
}
