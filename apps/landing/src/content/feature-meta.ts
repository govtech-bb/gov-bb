import { z } from 'zod'

// Metadata for a co-located feature module (src/routes/[url]/-meta.ts).
// registry.ts globs every -meta.ts, validates it here, and folds it into the
// same PAGES list markdown services use, so listings, search, breadcrumbs and
// the preview gate treat features identically.
//
// IMPORTANT: -meta.ts must stay side-effect-free and import nothing from the
// feature's -ui/ (no React, no date-fns). It is pulled into the shared,
// eagerly-evaluated registry bundle on every SSR render.
export const FeatureMetaSchema = z.object({
  // Full URL path, no leading slash, e.g. "health-and-emergency-services/stormready".
  url: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  // Category slug this service is listed under (must exist in categories.ts).
  category: z.string().min(1),
  // Optional sub-category slug. Must belong to the category.
  subcategory: z.string().optional(),
  // Extra search terms, mirroring a markdown page's frontmatter keywords.
  keywords: z.array(z.string()).default([]),
  // Rollout gate: same semantics as markdown frontmatter visibility.
  visibility: z.enum(['public', 'preview']).default('public'),
})

export type FeatureMeta = z.infer<typeof FeatureMetaSchema>
