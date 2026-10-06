import { createFileRoute } from '@tanstack/react-router'
import { Heading, Link, Search, Text } from '@govtech-bb/react'
import { z } from 'zod'
import { HelpfulBox } from '../../../components/HelpfulBox'
import { pageHead } from '../../../lib/page-head'
import { ORGS, orgHref } from './-lib/orgs'
import type { OrgKind } from './-lib/orgs'

const BASE_PATH = '/government/organisations'

const GROUPS: Array<{ kind: OrgKind; id: string; title: string }> = [
  { kind: 'ministry', id: 'ministries', title: 'Ministries' },
  { kind: 'department', id: 'departments', title: 'Departments' },
  { kind: 'state-body', id: 'state-bodies', title: 'State bodies' },
]

function filterGroups(query: string) {
  const q = query.toLowerCase()
  return GROUPS.map((group) => ({
    ...group,
    items: ORGS.filter(
      (org) =>
        org.kind === group.kind &&
        (org.name.toLowerCase().includes(q) ||
          (org.shortDescription?.toLowerCase().includes(q) ?? false)),
    ),
  })).filter((group) => group.items.length > 0)
}

export const Route = createFileRoute('/government/organisations/')({
  staticData: { breadcrumbMode: 'location' },
  validateSearch: z.object({ q: z.string().optional().default('') }),
  head: () =>
    pageHead(
      'Departments, agencies and public bodies',
      'Browse Government of Barbados ministries, departments, agencies and public bodies.',
      { noindex: true },
    ),
  component: OrganisationsPage,
})

function OrganisationsPage() {
  const query = Route.useSearch().q.trim()
  const groups = filterGroups(query)
  const totalResults = groups.reduce((sum, g) => sum + g.items.length, 0)

  return (
    <>
      <section className="border-teal-20 border-b-4 bg-teal-10 py-8">
        <div className="govbb-width-container">
          <div className="flex flex-col gap-2">
            <Text as="p" className="font-bold">
              Search for a department, agency or public body
            </Text>
            <Search
              action={BASE_PATH}
              label="Search for a department, agency or public body"
              buttonLabel="Search"
              inputProps={{ name: 'q', defaultValue: query }}
            />
          </div>
        </div>
      </section>

      <section className="pt-8 pb-8">
        <div className="govbb-width-container">
          <div className="flex flex-col gap-l">
            <div className="flex flex-col gap-xs">
              <Heading as="h1">Departments, agencies and public bodies</Heading>
              <Text as="p" className="text-grey-70">
                {!query
                  ? 'Government of Barbados ministries, departments, agencies and public bodies.'
                  : totalResults === 0
                    ? `No results for "${query}"`
                    : `${totalResults} result${totalResults === 1 ? '' : 's'} for "${query}"`}
              </Text>
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
                <Link href={BASE_PATH}>
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
                      {group.items.map((org) => (
                        <li
                          className="border-grey-20 border-b py-s first:pt-0"
                          key={org.slug}
                        >
                          <Link
                            href={orgHref(org.slug)}
                            className="wrap-break-word text-[19px] leading-normal"
                          >
                            {org.name}
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

      <div className="govbb-width-container">
        <HelpfulBox className="mb-4 lg:mb-16" />
      </div>
    </>
  )
}
