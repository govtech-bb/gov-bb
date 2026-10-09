/** A path for a new page: its title as a slug beneath a prefix, such as its category's path. */
export function suggestedUrl(prefix: string, title: string) {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200)
    .replace(/-+$/, "");

  return `${prefix}/${slug}`;
}
