import { createFileRoute } from '@tanstack/react-router'
import { Heading, Search, Text, linkVariants } from '@govtech-bb/react'
import { ChatAssistant } from '../components/ChatAssistant'
import { HelpfulBox } from '../components/HelpfulBox'
import { CATEGORIES } from '../content/categories'
import { isCategoryVisible } from '../content/registry'
import { trackEvent } from '../lib/analytics'
import { pageHead } from '../lib/page-head'

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
  const { level } = Route.useRouteContext()
  const categories = CATEGORIES.filter((cat) => isCategoryVisible(cat, level))

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
      <section className="border-b-4 border-yellow-100 bg-blue-00 text-white-00">
        <div className="container">
          <div className="space-y-m py-[clamp(var(--spacing-m),5vw,var(--spacing-l))]">
            <div className="max-w-210 space-y-s">
              <Heading as="h1" className="text-balance">
                Find and use Barbados government services
              </Heading>
              <Text as="p" className="text-pretty">
                Ask anything — applications, certificates, licences, benefits,
                and more. Get instant guidance.
              </Text>
            </div>
            <ChatAssistant />
          </div>
        </div>
      </section>

      <section className="border-b-4 border-teal-100 bg-green-10">
        <div className="container">
          <div className="space-y-m py-m">
            <Heading as="h4">Or search all government services directly</Heading>
            <Search
              action="/search-results"
              name="q"
              label="Search for a service"
              buttonLabel="Search"
              onSearch={handleSearch}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="space-y-m py-m lg:py-l">
            <Heading as="h2" className="text-balance">All government services</Heading>
            <ul className="m-0 flex list-none flex-col p-0">
              {categories.map((cat) => (
                <li
                  key={cat.slug}
                  className="border-b-2 border-grey-00 py-s lg:py-xm"
                >
                  <a
                    href={`/${cat.slug}`}
                    className={`${linkVariants()} text-[clamp(1.25rem,2.5vw,2rem)] leading-normal font-bold text-green-00`}
                  >
                    {cat.title}
                  </a>
                  {cat.description ? (
                    <Text as="p" className="mt-xxs text-pretty">
                      {cat.description}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="container">
        <HelpfulBox className="mb-s lg:mb-l" />
      </div>
    </>
  )
}
