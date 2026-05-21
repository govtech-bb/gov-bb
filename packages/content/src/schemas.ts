import { z } from "zod";

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export const contactSchema = z.object({
  label: z.string().optional(),
  type: z.enum(["phone", "email", "website", "address", "text"]).optional(),
  value: z.union([z.string(), z.array(z.string())]),
});
export type Contact = z.infer<typeof contactSchema>;

export const ministerSchema = z.object({
  name: z.string(),
  role: z.string().optional(),
  photo: z.string().optional(),
});
export type Minister = z.infer<typeof ministerSchema>;

// Reality on disk today: ministries use { title, href, description } for
// link tiles to legacy gov.bb pages. The unify-content-model plan reserved
// a future `formId` linking but it hasn't been adopted yet. Accept both
// shapes; downstream chunker treats them as "online service references".
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

export const associatedDeptGroupSchema = z.object({
  category: z.string().optional(),
  items: z.array(
    z.union([
      z.string(),
      z.object({ name: z.string(), slug: z.string().optional() }),
    ]),
  ),
});
export type AssociatedDepartmentGroup = z.infer<
  typeof associatedDeptGroupSchema
>;

// ---------------------------------------------------------------------------
// MDA frontmatter (ministry / department / state-body — kind discriminates)
// ---------------------------------------------------------------------------

export const orgKindSchema = z.enum(["ministry", "department", "state-body"]);
export type OrgKind = z.infer<typeof orgKindSchema>;

export const mdaFrontmatterSchema = z.object({
  kind: orgKindSchema,
  slug: z.string(),
  name: z.string(),
  shortDescription: z.string().optional(),
  intro: z.string().optional(),
  category: z.string().optional(),
  keywords: z.array(z.string()).optional().default([]),
  minister: ministerSchema.optional(),
  head: ministerSchema.optional(),
  contact: z.array(contactSchema).optional().default([]),
  onlineServices: z.array(onlineServiceLinkSchema).optional().default([]),
  associatedDepartments: z
    .array(associatedDeptGroupSchema)
    .optional()
    .default([]),
  originalSource: z.string().optional(),
});
export type MdaFrontmatter = z.infer<typeof mdaFrontmatterSchema>;

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
