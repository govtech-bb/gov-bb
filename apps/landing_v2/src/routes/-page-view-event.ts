import type { PageResponse } from '@govtech-bb/landing-v2-contract'

const FALLBACK_CATEGORY = 'uncategorised'

export function pageViewEvent(
  page: Pick<PageResponse, 'url' | 'frontmatter'>,
): {
  name: 'page-service-view' | 'page-start-view'
  data: { form: string; category: string }
} | null {
  const form = page.frontmatter.form_id
  if (!form) return null
  return {
    name: page.url.endsWith('/start') ? 'page-start-view' : 'page-service-view',
    data: {
      form,
      category: page.frontmatter.categories[0] ?? FALLBACK_CATEGORY,
    },
  }
}
