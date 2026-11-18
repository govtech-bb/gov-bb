import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { ViewLevel } from '../lib/frontmatter'
import { suggest } from '../lib/search'
import { trackEvent } from '../lib/analytics'
import { loadApiV2SearchDocuments } from '../lib/api-v2-site'
import type { ApiV2SearchDocument } from '../lib/api-v2-site'

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
  /** api_v2's search documents the page already has: a start, refreshed on edits. */
  documents?: readonly ApiV2SearchDocument[]
  /** Reads api_v2's search documents. */
  loadDocuments?: () => Promise<readonly ApiV2SearchDocument[]>
}

export function useServiceSearch({
  source,
  viewer,
  overlay,
  text,
  setText,
  suggesting,
  emptyTo,
  documents: givenDocuments,
  loadDocuments = loadApiV2SearchDocuments,
}: ServiceSearchOptions) {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState(givenDocuments)
  const hits = suggesting ? suggest(text, viewer, overlay, documents) : []

  // api_v2's pages: the same list while it is fresh, so a failed or outdated
  // read, or the page's own copy, is replaced on a later edit. Call it on
  // each edit of the search field.
  const refreshDocuments = () => {
    void loadDocuments().then(setDocuments)
  }

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

  return { hits, submit, onSuggestionSelect, refreshDocuments }
}
