import { createFileRoute } from '@tanstack/react-router'
import { Heading, Link, Search, Text } from '@govtech-bb/react'
import { z } from 'zod'
import { DEPARTMENTS } from '../content/departments'
import { MINISTRIES } from '../content/ministries'
import { orgHref } from '../content/orgs'
import { STATE_BODIES } from '../content/state-bodies'

interface Org {
  slug: string
  name: string
  shortDescription?: string
  href: string
}

interface OrgGroup {
  id: 'ministries' | 'departments' | 'state-bodies'
  title: string
  description: string
  items: Array<Org>
}

const toOrg = (item: {
  slug: string
  name: string
  shortDescription?: string
}): Org => ({
  slug: item.slug,
  name: item.name,
  shortDescription: item.shortDescription,
  href: orgHref(item.slug),
})

const byName = (a: Org, b: Org) => a.name.localeCompare(b.name)

const ALL_GROUPS: Array<OrgGroup> = (
  [
    {
      id: 'ministries',
      title: 'Ministries',
      description:
        'Ministries led by a government minister and dealing with policy.',
      items: MINISTRIES.map(toOrg).sort(byName),
    },
    {
      id: 'departments',
      title: 'Departments',
      description:
        'Statutory bodies, agencies, departments and public corporations that work with government.',
      items: DEPARTMENTS.map(toOrg).sort(byName),
    },
    {
      id: 'state-bodies',
      title: 'State bodies',
      description:
        'State-owned enterprises, public corporations and statutory bodies.',
      items: STATE_BODIES.map(toOrg).sort(byName),
    },
  ] satisfies Array<OrgGroup>
).filter((g) => g.items.length > 0)


function filterGroups(query: string): Array<OrgGroup> {
  const q = query.trim().toLowerCase()
  if (!q) return ALL_GROUPS
  return ALL_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.shortDescription?.toLowerCase().includes(q) ?? false),
    ),
  })).filter((g) => g.items.length > 0)
}

export const Route = createFileRoute('/government/organisations/')({
  validateSearch: z.object({ q: z.string().optional().default('') }),
  head: () => ({
    meta: [
      {
        title:
          'Departments, agencies and public bodies | Government of Barbados',
      },
      {
        name: 'description',
        content:
          'Browse Government of Barbados ministries, departments, agencies and public bodies.',
      },
    ],
  }),
  component: OrganisationsPage,
})

function OrganisationsPage() {
  const { q } = Route.useSearch()
  const query = q.trim()
  const groups = filterGroups(query)
  const totalResults = groups.reduce((sum, g) => sum + g.items.length, 0)
  const basePath = '/government/organisations'

  return (
    <>
      <section className="border-teal-40 border-b-4 bg-teal-10 py-8">
        <div className="container">
          <div className="flex flex-col gap-2">
            <Text as="p" className="font-bold">
              Search for a department, agency or public body
            </Text>
            <Search
              action={basePath}
              name="q"
              label="Search for a department, agency or public body"
              buttonLabel="Search"
              defaultValue={query}
            />
          </div>
        </div>
      </section>

      <section className="pt-8 pb-8">
        <div className="container">
          <div className="flex flex-col gap-l">
            <div className="flex flex-col gap-xs">
              <Heading as="h1">
                Departments, agencies and public bodies
              </Heading>
              {query ? (
                <Text as="p" className="text-mid-grey-00">
                  {totalResults === 0
                    ? `No results for "${query}"`
                    : `${totalResults} result${totalResults === 1 ? '' : 's'} for "${query}"`}
                </Text>
              ) : (
                <Text as="p" className="text-mid-grey-00">
                  Government of Barbados ministries, departments, agencies and
                  public bodies.
                </Text>
              )}
            </div>

            {!query && (
              <nav aria-label="Organisation categories">
                <ul className="flex flex-col gap-xs">
                  {groups.map((group) => (
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
                <Link href={basePath}>
                  view all departments, agencies and public bodies
                </Link>
                .
              </Text>
            ) : (
              <div className="flex flex-col gap-xl">
                {groups.map((group) => (
                  <section
                    aria-labelledby={`${group.id}-heading`}
                    className="grid scroll-mt-l grid-cols-1 gap-l md:grid-cols-3"
                    id={group.id}
                    key={group.id}
                  >
                    <div className="min-w-0 md:col-span-1">
                      <Heading
                        as="h2"
                        className="text-[20px] leading-tight"
                        id={`${group.id}-heading`}
                      >
                        {group.title}
                      </Heading>
                      <p className="mt-xs font-bold text-[96px] leading-none">
                        {group.items.length}
                      </p>
                    </div>
                    <ul className="flex min-w-0 flex-col md:col-span-2">
                      {group.items.map((item) => (
                        <li
                          className="border-grey-00 border-b py-s first:pt-0"
                          key={item.href}
                        >
                          <Link
                            href={item.href}
                            className="wrap-break-word text-[19px] leading-normal"
                          >
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

    </>
  )
}
