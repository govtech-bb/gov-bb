import { useEffect, useId, useState } from 'react'
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
  /** api_v2's search documents, when the page already has them. */
  documents?: readonly ApiV2SearchDocument[]
}

export function ServiceSearch({
  source,
  viewer,
  overlay,
  defaultValue = '',
  emptyHref = '/search-results',
  documents: givenDocuments,
}: ServiceSearchProps) {
  const navigate = useNavigate()
  const inputId = useId()
  const [inputValue, setInputValue] = useState(defaultValue)
  const [hasTyped, setHasTyped] = useState(false)
  const [loadedDocuments, setLoadedDocuments] =
    useState<readonly ApiV2SearchDocument[]>()
  const documents = givenDocuments ?? loadedDocuments
  const items = hasTyped ? suggest(inputValue, viewer, overlay, documents) : []

  // api_v2's pages, read once someone starts typing, unless already given.
  useEffect(() => {
    if (hasTyped && !givenDocuments)
      void loadApiV2SearchDocuments().then(setLoadedDocuments)
  }, [hasTyped, givenDocuments])

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
