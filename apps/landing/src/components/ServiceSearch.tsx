import { useId, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Autocomplete } from '@govtech-bb/react'
import type { ViewLevel } from '../lib/frontmatter'
import { suggest } from '../lib/search'
import { trackEvent } from '../lib/analytics'

type SearchSource = 'services' | 'results'

interface ServiceSearchProps {
  source: SearchSource
  viewer: ViewLevel
  overlay?: ReadonlyMap<string, ViewLevel>
  defaultValue?: string
}

export function ServiceSearch({
  source,
  viewer,
  overlay,
  defaultValue = '',
}: ServiceSearchProps) {
  const navigate = useNavigate()
  const inputId = useId()
  const [inputValue, setInputValue] = useState(defaultValue)
  const [hasTyped, setHasTyped] = useState(false)
  const items = hasTyped ? suggest(inputValue, viewer, overlay) : []

  const submit = (value: string) => {
    const query = value.trim()
    trackEvent('search-submit', { query, source })
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
