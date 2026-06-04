import { z } from "zod";

// Reality on disk today: services use { title, href, description } for link
// tiles to legacy gov.bb pages. The unify-content-model plan reserved a future
// `formId` linking but it hasn't been adopted yet. Accept both shapes.
export const onlineServiceLinkSchema = z.union([
  z.object({
    title: z.string(),
    href: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    formId: z.string(),
    label: z.string().optional(),
  }),
]);
export type OnlineServiceLink = z.infer<typeof onlineServiceLinkSchema>;

// ---------------------------------------------------------------------------
// Service frontmatter
// ---------------------------------------------------------------------------

export const serviceFrontmatterSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  source_url: z.string().optional(),
  stage: z.enum(["alpha"]).optional(),
  publish_date: z.union([z.string(), z.date()]).optional(),
  section: z.string().optional(),
  category: z.string().optional(),
  categories: z.array(z.string()).optional(),
  subcategory: z.string().optional(),
  service_type: z.enum(["digital", "information"]).optional(),
  forms: z.array(onlineServiceLinkSchema).optional().default([]),
});
export type ServiceFrontmatter = z.infer<typeof serviceFrontmatterSchema>;
