/** Words as a slug: lower-case letters and numbers, hyphens between words, accents dropped, at most `max` long. */
export function slugify(text: string, max: number) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}
