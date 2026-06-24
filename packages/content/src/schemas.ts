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
  // The forms-API recipe id this service starts (landing's StartLink target).
  // Zod's default object() silently dropped this before, severing the RAG →
  // forms-API linkage entirely (#1265). Landing uses "" for "no form yet" —
  // normalise that to undefined so consumers get a real id or nothing.
  form_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  // Rollout gate, mirroring apps/landing/src/lib/frontmatter.ts VIEW_LEVELS.
  // Non-public content must be excludable from chat retrieval (#1267).
  visibility: z
    .enum(["public", "preview", "draft"])
    .optional()
    .default("public"),
  forms: z.array(onlineServiceLinkSchema).optional().default([]),
});
export type ServiceFrontmatter = z.infer<typeof serviceFrontmatterSchema>;
