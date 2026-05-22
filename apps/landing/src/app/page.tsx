import type { Metadata } from 'next'
import { Heading, LinkButton, Text, linkVariants } from '@govtech-bb/react'
import { HelpfulBox } from '@/components/HelpfulBox'
import { CATEGORIES } from '@/content/categories'
import { SearchBox } from '@/components/SearchBox'

export const metadata: Metadata = {
  title: 'Government Services | Government of Barbados',
  description:
    "Access official Barbados government services online — apply for passports, birth certificates, driver's licences, and more at alpha.gov.bb.",
}

export default function Home() {
  return (
    <>
      <section className="border-b-4 border-yellow-00 bg-yellow-100">
        <div className="container">
          <div className="space-y-4 py-8">
            <Heading as="h1">
              How you find and use government services is changing
            </Heading>
            <Text as="p">
              It will be clearer, simpler and faster for citizens to get things
              done.
            </Text>
            <LinkButton
              href="/tell-us"
              variant="primary"
              data-umami-event="tell-us-cta"
              data-umami-event-source="home"
            >
              Tell us what&apos;s important
            </LinkButton>
          </div>
        </div>
      </section>

      <section className="border-b-4 border-teal-40 bg-teal-10">
        <div className="container">
          <div className="space-y-4 py-8">
            <Heading as="h2">Alpha services</Heading>
            <Text as="p">
              These services are new. We&apos;re working on them and they are likely
              to change as we learn more.
            </Text>
            <SearchBox
              action="/search-results"
              name="q"
              label="Search for a service"
              buttonLabel="Search"
              source="home"
            />
            <a href="/services" className={linkVariants()}>
              View all services
            </a>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="space-y-4 py-8">
            <Heading as="h2">Government services</Heading>
            <ul className="m-0 flex list-none flex-col p-0">
              {CATEGORIES.map((cat) => (
                <li
                  key={cat.slug}
                  className="border-t-2 border-grey-00 py-4 first:border-0 lg:py-8"
                >
                  <a
                    href={`/${cat.slug}`}
                    className={`${linkVariants()} text-[20px] leading-normal lg:text-3xl`}
                  >
                    {cat.title}
                  </a>
                  {cat.description ? (
                    <Text as="p" className="mt-1">
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
        <HelpfulBox className="mb-4 lg:mb-16" />
      </div>
    </>
  )
}
