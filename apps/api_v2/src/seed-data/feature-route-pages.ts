import type { SeedPage } from ".";

/** The fields of landing's `FeatureMeta` a feature-route page uses. */
export interface FeatureMeta {
  url: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  keywords?: string[];
  visibility?: SeedPage["visibility"];
}

/** The snapshot page for a landing route's `-meta.ts` `META`. */
export const featureRoutePage = (meta: FeatureMeta): SeedPage => ({
  url: `/${meta.url}`,
  category: meta.subcategory ?? meta.category,
  parent: null,
  title: meta.title,
  description: meta.description,
  visibility: meta.visibility ?? "public",
  form_id: null,
  content_slug: meta.url,
  published_at: null,
  // Landing renders these pages from their routes, never this body, and
  // chat ingests every body it is served, so none (#3256).
  body_markdown: "",
  frontmatter: meta.keywords ? { keywords: meta.keywords } : {},
});
