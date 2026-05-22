'use client'

import { useSearchParams } from 'next/navigation'
import { Heading, Link, Text } from '@govtech-bb/react'
import { HelpfulBox } from '@/components/HelpfulBox'
import { SearchBox } from '@/components/SearchBox'

interface OrgData {
  slug: string
  name: string
  shortDescription?: string
  href: string
}

interface OrgGroupData {
  id: string
  title: string
  description: string
  items: OrgData[]
}

function filterGroups(groups: OrgGroupData[], query: string): OrgGroupData[] {
  const q = query.trim().toLowerCase()
  if (!q) return groups
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.shortDescription?.toLowerCase().includes(q) ?? false),
      ),
    }))
    .filter((g) => g.items.length > 0)
}

export function OrganisationsClient({ groups }: { groups: OrgGroupData[] }) {
  const searchParams = useSearchParams()
  const query = (searchParams.get('q') ?? '').trim()
  const filtered = filterGroups(groups, query)
  const totalResults = filtered.reduce((sum, g) => sum + g.items.length, 0)
  const basePath = '/government/organisations'

  return (
    <>
      <section className="border-teal-40 border-b-4 bg-teal-10 py-8">
        <div className="container">
          <div className="flex flex-col gap-2">
            <Text as="p" className="font-bold">
              Search for a department, agency or public body
            </Text>
            <SearchBox
              action={basePath}
              name="q"
              label="Search for a department, agency or public body"
              buttonLabel="Search"
              defaultValue={query}
              source="organisations"
            />
          </div>
        </div>
      </section>

      <section className="pt-8 pb-8">
        <div className="container">
          <div className="flex flex-col gap-l">
            <div className="flex flex-col gap-xs">
              <Heading as="h1">Departments, agencies and public bodies</Heading>
              {query ? (
                <Text as="p" className="text-mid-grey-00">
                  {totalResults === 0
                    ? `No results for "${query}"`
                    : `${totalResults} result${totalResults === 1 ? '' : 's'} for "${query}"`}
                </Text>
              ) : (
                <Text as="p" className="text-mid-grey-00">
                  Government of Barbados ministries, departments, agencies and public bodies.
                </Text>
              )}
            </div>

            {!query && (
              <nav aria-label="Organisation categories">
                <ul className="flex flex-col gap-xs">
                  {filtered.map((group) => (
                    <li key={group.id}>
                      <Link href={`#${group.id}`}>
                        {group.title} ({group.items.length})
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {totalResults === 0 ? (
              <Text as="p">
                Try a different search term, or{' '}
                <Link href={basePath}>view all departments, agencies and public bodies</Link>.
              </Text>
            ) : (
              <div className="flex flex-col gap-xl">
                {filtered.map((group) => (
                  <section
                    aria-labelledby={`${group.id}-heading`}
                    className="grid scroll-mt-l grid-cols-1 gap-l md:grid-cols-3"
                    id={group.id}
                    key={group.id}
                  >
                    <div className="min-w-0 md:col-span-1">
                      <Heading as="h2" className="text-[20px] leading-tight" id={`${group.id}-heading`}>
                        {group.title}
                      </Heading>
                      <p className="mt-xs font-bold text-[96px] leading-none">{group.items.length}</p>
                    </div>
                    <ul className="flex min-w-0 flex-col md:col-span-2">
                      {group.items.map((item) => (
                        <li className="border-grey-00 border-b py-s first:pt-0" key={item.href}>
                          <Link href={item.href} className="wrap-break-word text-[19px] leading-normal">
                            {item.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="container">
        <HelpfulBox className="mb-4 lg:mb-16" />
      </div>
    </>
  )
}
