import { slugify } from "./slug";

/** Why a path cannot be a page's url, or undefined when it can. */
export function urlProblem(url: string) {
  if (!/^\/[^?#]*[^/?#]$/.test(url))
    return "Enter a path that starts with / and does not end with /";

  if (url.length > 512) return "Enter a path of 512 characters or fewer";

  if ((url.split("/").at(-1) ?? "").length > 200)
    return "Enter a last path segment of 200 characters or fewer";

  return undefined;
}

/** A path for a new page: its title as a slug beneath a prefix, such as its category's path. */
export function suggestedUrl(prefix: string, title: string) {
  return `${prefix}/${slugify(title, 200)}`;
}

const FIELD_LABELS = new Map([
  ["title", "Title"],
  ["url", "Path"],
  ["category", "Category"],
  ["category_id", "Category"],
  ["subcategory", "Subcategory"],
  ["description", "Description"],
  ["visibility", "Visibility"],
  ["form_id", "Form ID"],
  ["publish_date", "Publication date"],
  ["lede", "Introduction"],
  ["parent_id", "Parent page"],
  ["id", "Page"],
  ["body_markdown", "Content"],
  ["frontmatter", "Page settings"],
]);

/** How the editor names a field the API refused. */
export const pageFieldLabel = (field: string) => FIELD_LABELS.get(field) ?? field;
