import { z } from 'zod'

export const FrontmatterSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  /** Single-category shorthand. Folded into `categories` by the registry. */
  category: z.string().optional(),
  /** Multi-category form. A page is listed under every slug it claims. */
  categories: z.array(z.string()).optional(),
  /** Optional sub-category slug. Must belong to one of the page's categories. */
  subcategory: z.string().optional(),
  publish_date: z.coerce.date().optional(),
  source_url: z.url().optional(),
  stage: z.enum(['alpha']).optional(),
  featured: z.boolean().optional(),
  section: z.string().optional(),
  service_type: z.enum(['digital', 'information']).optional(),
  /**
   * Form ID in the forms API. When set, a `<a data-start-link>` element
   * inside the page's body is rendered as a Start now button linking to
   * the forms app — but only if the form ID is present in the
   * build-time manifest at src/content/available-forms.gen.ts.
   * See docs/decisions/0005 for the convention.
   */
  form_id: z.string().optional(),
  /**
   * When true, the page and its form sub-routes are hidden from the public.
   * They 404 for visitors without the preview cookie and are excluded from
   * search results and category/subcategory listings.
   * See docs/decisions/0006 for the visibility model.
   */
  draft: z.boolean().optional(),
  /**
   * When true, the page itself remains publicly visible but its form sub-routes
   * and inline "start" links are hidden for visitors without the preview cookie.
   * See docs/decisions/0006 for the visibility model.
   */
  protected: z.boolean().optional(),
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
}

export function titleFromSlug(slug: string): string {
  const leaf = slug.split('/').pop() ?? slug
  const words = leaf.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
