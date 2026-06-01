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
  /** Auto-maintained from the CMS row's updatedAt — shown as "Last updated". */
  updated_at: z.coerce.date().optional(),
  source_url: z.url().optional(),
  stage: z.enum(['alpha', 'beta', 'migrated']).optional(),
  /** How a digital service starts: a Form Builder form, or a link (calculator/external). */
  start_type: z.enum(['form', 'link']).optional(),
  /** Link target when start_type is 'link'. */
  start_url: z.string().optional(),
  /**
   * Form Builder form ID for a digital service. The Start now button links to
   * `${FORMS_BASE_URL}/forms/${form_id}`, but only if the id is in the build-time
   * manifest src/content/available-forms.gen.ts (see decision 0005).
   */
  form_id: z.string().optional(),
  /** True on an entry page that has a start page; its Start now button links to <url>/start. */
  has_start_page: z.boolean().optional(),
  /** True on the start page itself; its Start now button links to the form. */
  is_start_page: z.boolean().optional(),
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
