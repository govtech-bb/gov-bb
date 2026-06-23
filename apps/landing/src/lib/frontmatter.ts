import { z } from 'zod'

/**
 * Content rollout levels, ordered from least to most restricted. A page's
 * `visibility` is the *minimum* level a viewer must hold to see it; a request's
 * resolved level is the highest grant it carries. Access is hierarchical:
 * `draft` sees everything, `preview` sees public + preview, the public sees
 * only public (see `rankOf` in `content/registry.ts`).
 *
 * Like `preview`, `draft` is a rollout gate, *not* a confidentiality boundary —
 * the content still ships in the client bundle (see
 * `docs/decisions/0013-…`). It just sits one rung above `preview`, hidden even
 * from preview-token holders.
 */
export const VIEW_LEVELS = ['public', 'preview', 'draft'] as const
export type ViewLevel = (typeof VIEW_LEVELS)[number]

export const FrontmatterSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  categories: z.array(z.string()).optional(),
  subcategory: z.string().optional(),
  publish_date: z.coerce.date().optional(),
  source_url: z.url().optional(),
  stage: z.enum(['alpha']).optional(),
  visibility: z.enum(VIEW_LEVELS).optional().default('public'),
  featured: z.boolean().optional(),
  section: z.string().optional(),
  service_type: z.enum(['digital', 'information']).optional(),
  form_id: z.string().optional(),
})

export type RawFrontmatter = z.infer<typeof FrontmatterSchema>

/**
 * Resolved frontmatter after the registry normalises shape:
 * - `title` is always a string (derived from slug if absent)
 * - `categories` is always an array (folded from `category` or `categories`; possibly empty)
 */
export type Frontmatter = Omit<
  RawFrontmatter,
  'title' | 'category' | 'categories'
> & {
  title: string
  categories: Array<string>
  subcategory?: string
  /** Extra search terms. Set by co-located feature modules; markdown pages omit it. */
  keywords?: Array<string>
}

export function titleFromSlug(slug: string): string {
  const leaf = slug.split('/').pop() ?? slug
  const words = leaf.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
