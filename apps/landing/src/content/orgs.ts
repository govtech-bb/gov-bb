import type { MdaEntry } from '../lib/mda-types'
import type { MinistryPageProps } from '../components/MinistryPage'
import { BODY_BY_SLUG, DEPARTMENTS, MINISTRIES, STATE_BODIES } from './mda'
import type { Ministry, OrgKind } from './mda'
import type { ContentPage } from './registry'

export type { OrgKind }

interface KindConfig {
  /** Legacy URL prefix for `resolveOrgPath` to detect old `/ministries/foo` style links. */
  legacyPrefix: string
  entries: ReadonlyArray<Ministry | MdaEntry>
  bySlug: ReadonlyMap<string, Ministry | MdaEntry>
  leadershipLabel: string
}

const KIND_CONFIG: Record<OrgKind, KindConfig> = {
  ministry: {
    legacyPrefix: 'ministries/',
    entries: MINISTRIES,
    bySlug: new Map(MINISTRIES.map((m) => [m.slug, m])),
    leadershipLabel: 'Our Minister',
  },
  department: {
    legacyPrefix: 'departments/',
    entries: DEPARTMENTS,
    bySlug: new Map(DEPARTMENTS.map((d) => [d.slug, d])),
    leadershipLabel: 'Head of Department',
  },
  'state-body': {
    legacyPrefix: 'state-bodies/',
    entries: STATE_BODIES,
    bySlug: new Map(STATE_BODIES.map((s) => [s.slug, s])),
    leadershipLabel: 'Head',
  },
}

const ORG_KINDS = Object.keys(KIND_CONFIG) as OrgKind[]

export const ORG_PREFIXES: ReadonlyArray<readonly [string, OrgKind]> = (
  Object.entries(KIND_CONFIG) as Array<[OrgKind, KindConfig]>
).map(([kind, cfg]) => [cfg.legacyPrefix, kind] as const)

export const orgHref = (slug: string): string =>
  `/government/organisations/${slug}`

interface SyntheticFrontmatter {
  title: string
  description?: string
  source_url?: string
  categories: string[]
}

function syntheticPage(
  slug: string,
  entry: Ministry | MdaEntry,
): ContentPage | undefined {
  const body = BODY_BY_SLUG.get(slug)
  if (!body) return undefined
  const frontmatter: SyntheticFrontmatter = {
    title: entry.name,
    description: entry.shortDescription,
    source_url: entry.originalSource,
    categories: [],
  }
  return {
    slug: `government/organisations/${slug}`,
    url: orgHref(slug),
    frontmatter: frontmatter as ContentPage['frontmatter'],
    body,
  }
}

export const ORG_PAGE_BY_SLUG: ReadonlyMap<
  string,
  { kind: OrgKind; page?: ContentPage }
> = (() => {
  const map = new Map<string, { kind: OrgKind; page?: ContentPage }>()
  for (const kind of ORG_KINDS) {
    for (const entry of KIND_CONFIG[kind].entries) {
      if (map.has(entry.slug)) continue
      const page = syntheticPage(entry.slug, entry)
      map.set(entry.slug, { kind, page })
    }
  }
  return map
})()

// Every `slug` inside MINISTRIES.associatedDepartments must reference a real
// org page — fail fast on typos rather than ship dead links.
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

function getEntry(
  kind: OrgKind,
  slug: string,
): Ministry | MdaEntry | undefined {
  return KIND_CONFIG[kind].bySlug.get(slug)
}

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
    leadershipLabel: KIND_CONFIG.ministry.leadershipLabel,
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

export function resolveOrgProps(
  kind: OrgKind,
  slug: string,
  fallback: { title: string; originalSource?: string },
): MinistryPageProps {
  const entry = getEntry(kind, slug)
  if (!entry) return fallback
  if (kind === 'ministry') return ministryToProps(entry as Ministry)
  return mdaToProps(entry as MdaEntry, KIND_CONFIG[kind].leadershipLabel)
}
