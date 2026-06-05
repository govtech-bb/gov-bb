import { z } from 'zod'

export const FrontmatterSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  categories: z.array(z.string()).optional(),
  subcategory: z.string().optional(),
  publish_date: z.coerce.date().optional(),
  source_url: z.url().optional(),
  stage: z.enum(['alpha']).optional(),
  visibility: z.enum(['public', 'preview']).optional().default('public'),
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
