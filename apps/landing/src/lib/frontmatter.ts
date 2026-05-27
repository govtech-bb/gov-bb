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
  stage: z.enum(['alpha', 'beta', 'migrated']).optional(),
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
   * Structured Start now button from the CMS. Rendered after the body when
   * no `<a data-start-link>` anchor exists in the body (legacy pages keep
   * their authored mid-body placement; new pages use this field).
   */
  start_button: z
    .object({
      type: z.enum(['form', 'page', 'url']),
      href: z.string().optional(),
      label: z.string().optional(),
    })
    .optional(),
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
