import { useId, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Autocomplete } from '@govtech-bb/react'
import type { ViewLevel } from '../lib/frontmatter'
import { suggest } from '../lib/search'
import { loadApiV2SearchDocuments } from '../lib/api-v2-site'
import type { ApiV2SearchDocument } from '../lib/api-v2-site'
import { trackEvent } from '../lib/analytics'

type SearchSource = 'home' | 'services' | 'results'

interface ServiceSearchProps {
  source: SearchSource
  viewer: ViewLevel
  overlay?: ReadonlyMap<string, ViewLevel>
  defaultValue?: string
  emptyHref?: '/services' | '/search-results'
  /** api_v2's search documents the page already has: a start, refreshed on edits. */
  documents?: readonly ApiV2SearchDocument[]
  /** Reads api_v2's search documents. */
  loadDocuments?: () => Promise<readonly ApiV2SearchDocument[]>
}

export function ServiceSearch({
  source,
  viewer,
  overlay,
  defaultValue = '',
  emptyHref = '/search-results',
  documents: givenDocuments,
  loadDocuments = loadApiV2SearchDocuments,
}: ServiceSearchProps) {
  const navigate = useNavigate()
  const inputId = useId()
  const [inputValue, setInputValue] = useState(defaultValue)
  const [hasTyped, setHasTyped] = useState(false)
  const [documents, setDocuments] = useState(givenDocuments)
  const items = hasTyped ? suggest(inputValue, viewer, overlay, documents) : []

  const submit = (value: string) => {
    const query = value.trim()
    trackEvent('search-submit', { query, source })

    if (!query && emptyHref === '/services') {
      void navigate({ to: '/services' })
      return
    }

    void navigate({ to: '/search-results', search: { q: query } })
  }

  return (
    <form
      role="search"
      className="govbb-search items-start [&_[role=listbox]]:static [&_[role=listbox]]:mt-xs [&_[role=listbox]]:max-h-none [&_[role=listbox]]:overflow-visible"
      action="/search-results"
      method="get"
      onSubmit={(event) => {
        event.preventDefault()
        submit(inputValue)
      }}
    >
      <label className="govbb-visually-hidden" htmlFor={inputId}>
        Search for a service
      </label>
      <div className="min-w-0 flex-1">
        <Autocomplete
          id={inputId}
          name="q"
          autoComplete="off"
          className="govbb-search__input rounded-e-none"
          value={inputValue}
          suggestions={items.map((item) => ({ value: item.title }))}
          onChange={(event) => {
            setHasTyped(true)
            setInputValue(event.currentTarget.value)
            // api_v2's pages: the same list while it is fresh, so a failed or
            // outdated read, or the page's own copy, is replaced on a later edit.
            void loadDocuments().then(setDocuments)
          }}
          onSuggestionSelect={(_, index) => {
            const selectedItem = items[index]
            if (!selectedItem) return

            const typedQuery = inputValue.trim()
            setInputValue(selectedItem.title)
            trackEvent('search-suggestion-select', {
              query: typedQuery,
              title: selectedItem.title,
              href: selectedItem.href,
              position: index + 1,
              source,
            })
            submit(selectedItem.title)
          }}
        />
      </div>
      <button className="govbb-search__button" type="submit">
        Search
      </button>
    </form>
  )
}
