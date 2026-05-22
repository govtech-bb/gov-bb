'use client'

import { Search } from '@govtech-bb/react'
import { trackEvent } from '@/lib/analytics'

interface SearchBoxProps {
  action: string
  name: string
  label: string
  buttonLabel: string
  defaultValue?: string
  source?: string
}

export function SearchBox({
  action,
  name,
  label,
  buttonLabel,
  defaultValue,
  source = 'unknown',
}: SearchBoxProps) {
  const handleSearch = (q: string) => {
    trackEvent('search-submit', { query: q, source })
    if (q === '') {
      window.location.href = action
      return
    }
    window.location.href = `${action}?${name}=${encodeURIComponent(q)}`
  }

  return (
    <Search
      action={action}
      name={name}
      label={label}
      buttonLabel={buttonLabel}
      defaultValue={defaultValue}
      onSearch={handleSearch}
    />
  )
}
