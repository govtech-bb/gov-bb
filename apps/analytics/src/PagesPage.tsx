import { useState } from 'react'
import { Heading, Text } from '@govtech-bb/react'
import { useNavigate } from '@tanstack/react-router'
import { AnalyticsChrome } from './components/AnalyticsChrome'
import { PagesTable } from './components/PagesTable'
import type { PagesPayload } from './lib/report'

export default function PagesPage({ data }: { data: PagesPayload }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')

  const q = filter.trim().toLowerCase()
  const pages = q
    ? data.pages.filter(
        (p) =>
          p.title.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
      )
    : data.pages

  return (
    <>
      <AnalyticsChrome
        range={data.range}
        onRangeChange={(range) =>
          navigate({ to: '/analytics/pages', search: { range } })
        }
      />
      <div className="container py-8">
        <Heading as="h1" size="h1" className="mb-s">
          Pages
        </Heading>
        <Text as="p" size="caption" className="mb-l text-mid-grey-00">
          Live content pages and their traffic for {data.window}.
        </Text>
        {data.configured ? (
          <>
            <input
              type="search"
              aria-label="Filter pages by title or path"
              placeholder="Filter by title or path…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mb-s w-full max-w-md rounded-lg border border-grey-00 px-s py-s text-caption"
            />
            <PagesTable pages={pages} range={data.range} />
          </>
        ) : (
          <Text as="p" className="text-mid-grey-00">
            Analytics is not configured.
          </Text>
        )}
      </div>
    </>
  )
}
