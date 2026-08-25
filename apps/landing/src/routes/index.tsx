import { createFileRoute } from '@tanstack/react-router'
import { Heading, Search, Text } from '@govtech-bb/react'
import { ChatAssistant } from '../components/ChatAssistant'
import { HelpfulBox } from '../components/HelpfulBox'
import { CATEGORIES } from '../content/categories'
import { isCategoryVisible } from '../content/registry'
import { trackEvent } from '../lib/analytics'
import { pageHead } from '../lib/page-head'
import { deriveVisibilityOverlay } from '../lib/service-status'

export const Route = createFileRoute('/')({
  head: () =>
    pageHead(
      'Government Services',
      "Access official Barbados government services online — apply for passports, birth certificates, driver's licences, and more at alpha.gov.bb.",
      { path: '/' },
    ),
  component: Home,
})

function Home() {
  const { level, serviceStatuses } = Route.useRouteContext()
  const overlay = deriveVisibilityOverlay(serviceStatuses)
  const categories = CATEGORIES.filter((cat) =>
    isCategoryVisible(cat, level, overlay),
  )

  const handleSearch = (q: string) => {
    trackEvent('search-submit', { query: q, source: 'home' })
    if (q === '') {
      window.location.href = '/services'
      return
    }
    window.location.href = `/search-results?q=${encodeURIComponent(q)}`
  }

  return (
    <>
      <section className="border-b-4 border-yellow-40 bg-blue-80 text-white-00">
        <div className="govbb-width-container">
          <div className="space-y-m py-[clamp(var(--spacing-m),5vw,var(--spacing-l))]">
            <div className="max-w-210 space-y-s">
              <Heading as="h1">
                Find and use Barbados government services
              </Heading>
              <Text as="p" size="body-lg">
                Ask anything — applications, certificates, licences, benefits,
                and more. Get instant guidance.
              </Text>
            </div>
            <ChatAssistant />
          </div>
        </div>
      </section>

      <section className="border-b-4 border-teal-40 bg-green-10">
        <div className="govbb-width-container">
          <div className="space-y-m py-m">
            <Heading as="h4">
              Or search all government services directly
            </Heading>
            <Search
              action="/search-results"
              label="Search for a service"
              buttonLabel="Search"
              inputProps={{ name: 'q' }}
              onSubmit={(event) => {
                event.preventDefault()
                const q = String(
                  new FormData(event.currentTarget).get('q') ?? '',
                ).trim()
                handleSearch(q)
              }}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="govbb-width-container">
          <div className="space-y-m py-m lg:py-l">
            <Heading as="h2">
              All government services
            </Heading>
            <ul className="m-0 flex list-none flex-col p-0">
              {categories.map((cat) => (
                <li
                  key={cat.slug}
                  className="border-neutral border-b-2 py-s lg:py-xm [--govbb-link-color:var(--govbb-color-tertiary)]"
                >
                  <a
                    href={`/${cat.slug}`}
                    className="govbb-link govbb-text-body-lg govbb-text-bold"
                  >
                    {cat.title}
                  </a>
                  {cat.description ? (
                    <Text as="p" className="mt-xxs">
                      {cat.description}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="govbb-width-container">
        <HelpfulBox className="mb-s lg:mb-l" />
      </div>
    </>
  )
}
