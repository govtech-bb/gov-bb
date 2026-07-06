import type { ContentPage } from '../content/registry'

const FALLBACK_CATEGORY = 'uncategorised'

export function pageViewEvent(page: ContentPage): {
  name: 'page-service-view' | 'page-start-view'
  data: { form: string; category: string }
} | null {
  const form = page.frontmatter.form_id
  if (!form) return null
  return {
    name: page.slug.endsWith('/start')
      ? 'page-start-view'
      : 'page-service-view',
    data: {
      form,
      category: page.frontmatter.categories[0] ?? FALLBACK_CATEGORY,
    },
  }
}
