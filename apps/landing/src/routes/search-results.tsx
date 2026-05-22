import { createFileRoute } from '@tanstack/react-router'
import { Heading, Link, Search as SearchInput, Text } from '@govtech-bb/react'
import { z } from 'zod'
import { search  } from '../lib/search'
import type {SearchHit} from '../lib/search';
import { trackEvent } from '../lib/analytics'

const SearchParams = z.object({
  q: z.string().optional().default(''),
})

export const Route = createFileRoute('/search-results')({
  validateSearch: SearchParams,
  head: () => ({
    meta: [{ title: 'Search Results | Government of Barbados' }],
  }),
  component: SearchResultsPage,
})

function labelFor(hit: SearchHit): string {
  if (hit.kind !== 'service') return hit.category
  return 'Information service'
}

function SearchResultsPage() {
  const { q } = Route.useSearch()
  const { previewMode } = Route.useRouteContext()
  const query = q.trim()
  const hits = query ? search(query, previewMode) : []
  const hasResults = query && hits.length > 0
  const hasNoResults = query && hits.length === 0

  return (
    <>
      <section className="border-teal-40 border-b-4 bg-teal-10 py-8">
        <div className="container">
          <div className="flex flex-col gap-2">
            <Text as="p" className="font-bold">
              Search for a service
            </Text>
            <SearchInput
              action="/search-results"
              name="q"
              label="Search for a service"
              buttonLabel="Search"
              defaultValue={query}
              onSearch={(submitted) => {
                trackEvent('search-submit', { query: submitted, source: 'results' })
                window.location.href = submitted
                  ? `/search-results?q=${encodeURIComponent(submitted)}`
                  : '/search-results'
              }}
            />
          </div>
        </div>
      </section>

      <section className="pt-4 pb-8">
        <div className="container">
          <div aria-live="polite">
            <Heading as="h2" className="mb-s">
              Search results
            </Heading>

            {hasResults ? (
              <Text as="p" className="mb-s">
                {hits.length} search {hits.length === 1 ? 'result' : 'results'}{' '}
                for &ldquo;<strong>{query}</strong>&rdquo;{' '}
                {hits.length === 1 ? 'was' : 'were'} found
              </Text>
            ) : null}

            {hasNoResults ? (
              <div className="space-y-s">
                <Text as="p">
                  We could not find any results for &ldquo;
                  <strong>{query}</strong>&rdquo;
                </Text>
                <Text as="p">You can try:</Text>
                <ul className="list-disc space-y-xs ps-m">
                  <li>
                    <Text as="span">checking your spelling</Text>
                  </li>
                  <li>
                    <Text as="span">using different words</Text>
                  </li>
                </ul>
                <Text as="p">
                  You can also{' '}
                  <Link className="inline" href="/services">
                    browse all government services
                  </Link>
                  .
                </Text>
              </div>
            ) : null}

            {hasResults ? (
              <ul className="flex flex-col gap-s">
                {hits.map((hit) => (
                  <li
                    key={hit.id}
                    className="flex flex-col items-start gap-xs border-grey-00 border-b-2 py-s first:pt-0"
                  >
                    <Link
                      className="text-[20px] leading-normal"
                      href={hit.href}
                    >
                      {hit.title}
                    </Link>
                    {hit.description ? (
                      <Text as="p" className="hidden lg:block">
                        {hit.description}
                      </Text>
                    ) : null}
                    <Text as="p" className="text-mid-grey-00">
                      {labelFor(hit)}
                    </Text>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
    </>
  )
}
