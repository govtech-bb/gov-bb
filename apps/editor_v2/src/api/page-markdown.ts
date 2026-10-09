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
