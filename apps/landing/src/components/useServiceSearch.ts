import { useNavigate } from '@tanstack/react-router'
import type { ViewLevel } from '../lib/frontmatter'
import { suggest } from '../lib/search'
import { trackEvent } from '../lib/analytics'

export type SearchSource = 'services' | 'results' | 'home'

interface ServiceSearchOptions {
  source: SearchSource
  viewer: ViewLevel
  overlay?: ReadonlyMap<string, ViewLevel>
  /** The search field's current text. */
  text: string
  setText: (text: string) => void
  suggesting: boolean
  /** Where an empty search goes, instead of an empty results page. */
  emptyTo?: '/services'
}

export function useServiceSearch({
  source,
  viewer,
  overlay,
  text,
  setText,
  suggesting,
  emptyTo,
}: ServiceSearchOptions) {
  const navigate = useNavigate()
  const hits = suggesting ? suggest(text, viewer, overlay) : []

  const submit = (value: string) => {
    const query = value.trim()
    trackEvent('search-submit', { query, source })
    if (!query && emptyTo) {
      void navigate({ to: emptyTo })
      return
    }
    void navigate({ to: '/search-results', search: { q: query } })
  }

  const onSuggestionSelect = (_: unknown, index: number) => {
    const hit = hits[index]
    if (!hit) return

    const typedQuery = text.trim()
    setText(hit.title)
    trackEvent('search-suggestion-select', {
      query: typedQuery,
      title: hit.title,
      href: hit.href,
      position: index + 1,
      source,
    })
    submit(hit.title)
  }

  return { hits, submit, onSuggestionSelect }
}
