import { createFileRoute } from '@tanstack/react-router'
import { Heading, Link, Search, Text } from '@govtech-bb/react'
import { HelpfulBox } from '../components/HelpfulBox'
import { isDigitalService, isVisible, PAGES } from '../content/registry'
import { trackEvent } from '../lib/analytics'
import { pageHead } from '../lib/page-head'
import { deriveVisibilityOverlay } from '../lib/service-status'

export const Route = createFileRoute('/services')({
  head: () =>
    pageHead(
      'Alpha services',
      'Browse all digital government services available on alpha.gov.bb.',
      { path: '/services' },
    ),
  component: ServicesPage,
})

function ServicesPage() {
  const { level, serviceStatuses } = Route.useRouteContext()
  const overlay = deriveVisibilityOverlay(serviceStatuses)
  const items = PAGES.filter(
    (p) =>
      p.frontmatter.stage === 'alpha' &&
      !p.slug.endsWith('/start') &&
      isVisible(p, level, overlay),
  )
    .map((p) => ({
      title: p.frontmatter.title,
      href: `/${p.url}`,
      slug: p.url,
      digital: isDigitalService(p),
    }))
    .sort((a, b) => a.title.localeCompare(b.title))

  return (
    <>
      <section className="border-teal-40 border-b-4 bg-teal-10 py-8">
        <div className="container">
          <div className="flex flex-col gap-2">
            <Text as="p" className="font-bold">
              Search for a service
            </Text>
            <Search
              action="/search-results"
              name="q"
              label="Search for a service"
              buttonLabel="Search"
              onSearch={(q) => {
                trackEvent('search-submit', { query: q, source: 'services' })
                window.location.href = q
                  ? `/search-results?q=${encodeURIComponent(q)}`
                  : '/search-results'
              }}
            />
          </div>
        </div>
      </section>

      <section className="pt-4 pb-8">
        <div className="container">
          <Heading as="h1" className="mb-s">
            Alpha services
          </Heading>
          <Text as="p" className="mb-s">
            These services are in alpha.
          </Text>
          {items.length > 0 ? (
            <ul className="flex flex-col gap-s">
              {items.map((item) => (
                <li
                  key={item.slug}
                  className="flex flex-col items-start gap-xs border-grey-00 border-b-2 py-s first:pt-0"
                >
                  <Link
                    href={item.href}
                    className="text-[20px] leading-normal"
                    data-umami-event={`service-${item.slug.replace(/\//g, '-')}`}
                    data-umami-event-title={item.title}
                  >
                    {item.title}
                  </Link>
                  <Text as="p" className="text-mid-grey-00">
                    {item.digital ? 'Digital service' : 'Information service'}
                  </Text>
                </li>
              ))}
            </ul>
          ) : (
            <Text as="p">No alpha services yet.</Text>
          )}
        </div>
      </section>

      <div className="container">
        <HelpfulBox className="mb-4 lg:mb-16" />
      </div>
    </>
  )
}
