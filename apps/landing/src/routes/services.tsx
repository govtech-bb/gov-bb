import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Heading, Link, Search, Text } from '@govtech-bb/react'
import { HelpfulBox } from '../components/HelpfulBox'
import { allServicesQueryOptions, cmsRouteHeaders } from '../lib/cms'
import { trackEvent } from '../lib/analytics'

export const Route = createFileRoute('/services')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(allServicesQueryOptions(context.flag)),
  headers: ({ match }) => cmsRouteHeaders(match.status),
  head: () => ({
    meta: [
      { title: 'Alpha services | Government of Barbados' },
      {
        name: 'description',
        content:
          'Browse all digital government services available on alpha.gov.bb.',
      },
    ],
  }),
  errorComponent: ServicesError,
  component: ServicesPage,
})

function ServicesPage() {
  const { flag } = Route.useRouteContext()
  const { data: services } = useSuspenseQuery(allServicesQueryOptions(flag))

  // Each service is one document; `digital` is true when it has a start action
  // (a form or a link), which is what marks it as a transactional service here.
  const items = services
    .filter((s) => s.stage === 'alpha')
    .map((s) => ({
      title: s.title,
      href: `/${s.url}`,
      slug: s.slug,
      isEntry: Boolean(s.digital),
    }))
    // API already returns sort=title, but re-sort defensively in case of locale.
    .sort((a, b) => a.title.localeCompare(b.title))

  return (
    <>
      <ServicesHero />

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
                    {item.isEntry ? 'Digital service' : 'Information service'}
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

function ServicesHero() {
  return (
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
  )
}

function ServicesError() {
  return (
    <>
      <ServicesHero />
      <section className="pt-4 pb-8">
        <div className="container">
          <Heading as="h1" className="mb-s">
            Alpha services
          </Heading>
          <Text as="p" className="text-mid-grey-00">
            The service list is temporarily unavailable. Please try again
            shortly.
          </Text>
        </div>
      </section>
    </>
  )
}
