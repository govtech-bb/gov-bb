import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Heading, Link, Text } from '@govtech-bb/react'
import { z } from 'zod'
import { ServiceSearch } from '../components/ServiceSearch'
import { search } from '../lib/search'
import { trackEvent } from '../lib/analytics'
import { deriveVisibilityOverlay } from '../lib/service-status'

const SearchParams = z.object({
  q: z.string().optional().default(''),
})

export const Route = createFileRoute('/search-results')({
  validateSearch: SearchParams,
  head: () => ({
    meta: [
      { title: 'Search Results | Government of Barbados' },
      // Query-param result pages are thin/duplicate content — keep them out of
      // the index (noindex still lets crawlers follow the result links).
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: SearchResultsPage,
})

function SearchResultsPage() {
  const { q } = Route.useSearch()
  const { level, serviceStatuses } = Route.useRouteContext()
  const query = q.trim()
  const overlay = deriveVisibilityOverlay(serviceStatuses)
  const hits = query ? search(query, level, overlay) : []

  useEffect(() => {
    if (!query) return
    trackEvent('search', { query, results: hits.length })
    if (hits.length === 0) trackEvent('search-no-results', { query })
  }, [query, hits.length])

  const hasResults = query && hits.length > 0
  const hasNoResults = query && hits.length === 0

  return (
    <>
      <section className="border-teal-20 border-b-4 bg-teal-10 py-8">
        <div className="govbb-width-container">
          <div className="flex flex-col gap-2">
            <Text as="p" className="font-bold">
              Search for a service
            </Text>
            <ServiceSearch
              key={query}
              source="results"
              viewer={level}
              overlay={overlay}
              defaultValue={query}
            />
          </div>
        </div>
      </section>

      <section className="pt-4 pb-8">
        <div className="govbb-width-container">
          <Heading as="h1" size="h2" className="mb-s">
            Search results
          </Heading>

          {hasResults ? (
            <Text
              as="p"
              aria-atomic="true"
              aria-live="polite"
              className="mb-s break-words"
            >
              {hits.length} search {hits.length === 1 ? 'result' : 'results'}{' '}
              for &ldquo;<strong>{query}</strong>&rdquo;{' '}
              {hits.length === 1 ? 'was' : 'were'} found
            </Text>
          ) : null}

          {hasNoResults ? (
            <div className="space-y-s">
              <Text
                as="p"
                aria-atomic="true"
                aria-live="polite"
                className="break-words"
              >
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
              {hits.map((hit, index) => (
                <li
                  key={hit.id}
                  className="flex flex-col items-start gap-xs border-grey-20 border-b-2 py-s first:pt-0"
                >
                  <Link
                    className="text-body leading-normal"
                    href={hit.href}
                    onClick={() =>
                      trackEvent('search-result-click', {
                        query,
                        position: index + 1,
                        href: hit.href,
                      })
                    }
                  >
                    {hit.title}
                  </Link>
                  {hit.description ? (
                    <Text as="p">{hit.description}</Text>
                  ) : null}
                  <Text as="p" className="text-body-sm text-grey-70">
                    {hit.digital ? 'Digital service' : 'Information service'}
                  </Text>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </>
  )
}
