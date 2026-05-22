import type { Metadata } from 'next'
import { Suspense } from 'react'
import { DEPARTMENTS, MINISTRIES, STATE_BODIES } from '@/content/mda'
import { orgHref } from '@/content/orgs-shared'
import { OrganisationsClient } from './OrganisationsClient'

export const metadata: Metadata = {
  title: 'Departments, agencies and public bodies | Government of Barbados',
  description:
    'Browse Government of Barbados ministries, departments, agencies and public bodies.',
}

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

const toOrg = (item: { slug: string; name: string; shortDescription?: string }): OrgData => ({
  slug: item.slug,
  name: item.name,
  shortDescription: item.shortDescription,
  href: orgHref(item.slug),
})

const byName = (a: OrgData, b: OrgData) => a.name.localeCompare(b.name)

export default function OrganisationsPage() {
  const groups: OrgGroupData[] = [
    {
      id: 'ministries',
      title: 'Ministries',
      description: 'Ministries led by a government minister and dealing with policy.',
      items: MINISTRIES.map(toOrg).sort(byName),
    },
    {
      id: 'departments',
      title: 'Departments',
      description: 'Statutory bodies, agencies, departments and public corporations that work with government.',
      items: DEPARTMENTS.map(toOrg).sort(byName),
    },
    {
      id: 'state-bodies',
      title: 'State bodies',
      description: 'State-owned enterprises, public corporations and statutory bodies.',
      items: STATE_BODIES.map(toOrg).sort(byName),
    },
  ].filter((g) => g.items.length > 0)

  return (
    <Suspense>
      <OrganisationsClient groups={groups} />
    </Suspense>
  )
}
