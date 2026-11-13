import { useId, useState } from 'react'
import { Autocomplete } from '@govtech-bb/react'
import type { ViewLevel } from '../lib/frontmatter'
import { useServiceSearch } from './useServiceSearch'

interface ServiceSearchProps {
  source: 'services' | 'results'
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
  const inputId = useId()
  const [inputValue, setInputValue] = useState(defaultValue)
  const [hasTyped, setHasTyped] = useState(false)
  const { hits, submit, onSuggestionSelect } = useServiceSearch({
    source,
    viewer,
    overlay,
    text: inputValue,
    setText: setInputValue,
    suggesting: hasTyped,
  })

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
          suggestions={hits.map((hit) => ({ value: hit.title }))}
          onChange={(event) => {
            setHasTyped(true)
            setInputValue(event.currentTarget.value)
          }}
          onSuggestionSelect={onSuggestionSelect}
        />
      </div>
      <button className="govbb-search__button" type="submit">
        Search
      </button>
    </form>
  )
}
