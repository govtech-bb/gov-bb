import { z } from "zod";

/**
 * Content rollout levels, ordered from least to most restricted. Copied from
 * `apps/landing/src/lib/frontmatter.ts` (v1); only the pieces `pages.ts` needs
 * are kept.
 */
export const VIEW_LEVELS = ["public", "preview", "draft"] as const;

export const FrontmatterSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  lede: z.string().optional(),
  category: z.string().optional(),
  categories: z.array(z.string()).optional(),
  subcategory: z.string().optional(),
  publish_date: z.coerce.date().optional(),
  source_url: z.url().optional(),
  stage: z.enum(["alpha"]).optional(),
  visibility: z.enum(VIEW_LEVELS).optional().default("public"),
  featured: z.boolean().optional(),
  section: z.string().optional(),
  service_type: z.enum(["digital", "information"]).optional(),
  form_id: z.string().optional(),
  keywords: z.array(z.string().trim().min(1)).optional(),
});

export function titleFromSlug(slug: string): string {
  const leaf = slug.split("/").pop() ?? slug;
  const words = leaf.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
