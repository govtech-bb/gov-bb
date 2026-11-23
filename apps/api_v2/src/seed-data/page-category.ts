/**
 * A markdown page's category, from its frontmatter `category` and
 * `categories`. An api_v2 page has one `category_id`, so a page that names
 * two fails the snapshot build instead of dropping out of the second
 * category's listing without anyone deciding to (#3713).
 */
export function pageCategory(
  slug: string,
  data: { category?: string; categories?: string[] },
): string | undefined {
  const categories = [
    ...new Set<string>([
      ...(data.category ? [data.category] : []),
      ...(data.categories ?? []),
    ]),
  ];
  if (categories.length > 1) {
    throw new Error(
      `${slug} names ${categories.length} categories (${categories.join(", ")}). An api_v2 page has one category: keep one in its frontmatter (#3713).`,
    );
  }
  return categories[0];
}
