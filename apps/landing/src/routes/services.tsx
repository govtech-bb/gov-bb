import { createFileRoute } from '@tanstack/react-router'
import { Heading, Link, Search, Text } from '@govtech-bb/react'
import { PAGES } from '../content/registry'

export const Route = createFileRoute('/services')({
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
  component: ServicesPage,
})

function ServicesPage() {
  const startSlugs = new Set(
    PAGES.filter((p) => p.slug.endsWith('/start')).map((p) => p.slug),
  )
  const items = PAGES.filter(
    (p) => p.frontmatter.stage === 'alpha' && !p.slug.endsWith('/start'),
  )
    .map((p) => ({
      title: p.frontmatter.title,
      href: `/${p.url}`,
      slug: p.url,
      isEntry: startSlugs.has(`${p.slug}/start`),
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

    </>
  )
}
