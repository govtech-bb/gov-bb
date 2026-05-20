import type { MdaEntry } from '../lib/mda-types'
import type { MinistryPageProps } from '../components/MinistryPage'
import { MINISTRIES  } from './ministries'
import type {Ministry} from './ministries';
import { DEPARTMENTS } from './departments'
import { findPage  } from './registry'
import type {ContentPage} from './registry';
import { STATE_BODIES } from './state-bodies'

export type OrgKind = 'ministry' | 'department' | 'state-body'

const MINISTRY_BY_SLUG = new Map(MINISTRIES.map((m) => [m.slug, m]))
const DEPARTMENT_BY_SLUG = new Map(DEPARTMENTS.map((d) => [d.slug, d]))
const STATE_BODY_BY_SLUG = new Map(STATE_BODIES.map((s) => [s.slug, s]))

export const ORG_PREFIXES: ReadonlyArray<readonly [string, OrgKind]> = [
  ['ministries/', 'ministry'],
  ['departments/', 'department'],
  ['state-bodies/', 'state-body'],
]

export const orgHref = (slug: string): string =>
  `/government/organisations/${slug}`

/**
 * Precomputed leaf-slug → org lookup. Built once at module load by iterating
 * ORG_PREFIXES in order — ministry wins on the (currently empty) collision
 * case. `page` is undefined when the structured entry has no matching
 * markdown file; the detail route still renders the structured data.
 */
export const ORG_PAGE_BY_SLUG: ReadonlyMap<
  string,
  { kind: OrgKind; page?: ContentPage }
> = (() => {
  const map = new Map<string, { kind: OrgKind; page?: ContentPage }>()
  for (const [prefix, kind] of ORG_PREFIXES) {
    const list =
      kind === 'ministry'
        ? MINISTRIES
        : kind === 'department'
          ? DEPARTMENTS
          : STATE_BODIES
    for (const entry of list) {
      if (map.has(entry.slug)) continue
      const page = findPage(`${prefix}${entry.slug}`)
      map.set(entry.slug, { kind, page })
    }
  }
  return map
})()

// Build-time validation: every `slug` inside MINISTRIES.associatedDepartments
// must reference a real org page. Fails fast at import to catch typos before
// they ship as 404 links.
for (const ministry of MINISTRIES) {
  for (const group of ministry.associatedDepartments ?? []) {
    for (const item of group.items) {
      if (item.slug && !ORG_PAGE_BY_SLUG.has(item.slug)) {
        throw new Error(
          `Associated org slug "${item.slug}" on ministry "${ministry.slug}" (item "${item.name}") does not resolve to a known org page.`,
        )
      }
    }
  }
}

/** Strips a leading slash so callers can pass either a slug or a pathname. */
export function resolveOrgPath(
  pathOrSlug: string,
): { kind: OrgKind; orgSlug: string } | null {
  const normalised = pathOrSlug.replace(/^\/+|\/+$/g, '')
  for (const [prefix, kind] of ORG_PREFIXES) {
    if (normalised.startsWith(prefix)) {
      return { kind, orgSlug: normalised.slice(prefix.length) }
    }
  }
  return null
}

function getEntry(kind: OrgKind, slug: string): Ministry | MdaEntry | undefined {
  if (kind === 'ministry') return MINISTRY_BY_SLUG.get(slug)
  if (kind === 'department') return DEPARTMENT_BY_SLUG.get(slug)
  return STATE_BODY_BY_SLUG.get(slug)
}

/** Cheap check that avoids allocating a full MinistryPageProps. */
export function hasMigratedSource(kind: OrgKind, slug: string): boolean {
  return Boolean(getEntry(kind, slug)?.originalSource)
}

function ministryToProps(m: Ministry): MinistryPageProps {
  return {
    title: m.name,
    featured: m.featured,
    services: m.services,
    onlineServices: m.onlineServices,
    minister: m.minister,
    leadershipLabel: 'Our Minister',
    contact: m.contact,
    associatedDepartments: m.associatedDepartments,
    originalSource: m.originalSource,
  }
}

function mdaToProps(
  entry: MdaEntry,
  leadershipLabel: string,
): MinistryPageProps {
  return {
    title: entry.name,
    minister: entry.head,
    leadershipLabel,
    contact: entry.contact,
    originalSource: entry.originalSource,
  }
}

/**
 * Returns fully-resolved MinistryPageProps. When the slug has no structured
 * entry, the fallback supplies title + originalSource so the page still renders
 * the hero shell around the page's markdown body.
 */
export function resolveOrgProps(
  kind: OrgKind,
  slug: string,
  fallback: { title: string; originalSource?: string },
): MinistryPageProps {
  const entry = getEntry(kind, slug)
  if (!entry) return fallback
  if (kind === 'ministry') return ministryToProps(entry as Ministry)
  return mdaToProps(
    entry as MdaEntry,
    kind === 'department' ? 'Head of Department' : 'Head',
  )
}
