import type { Root } from 'hast'
import { resolveServiceHref } from '../../../../content/registry'

export type OrgKind = 'ministry' | 'department' | 'state-body'

export interface Person {
  name: string
  role: string
}

export type ContactItem =
  | { label: string; type: 'phone' | 'email'; value: string }
  | { label: string; type: 'website'; value: string; display?: string }
  | { label: string; type: 'address'; value: string | Array<string> }

export interface OrgService {
  title: string
  href: string
  description: string
}

export interface Org {
  kind: OrgKind
  slug: string
  name: string
  shortDescription?: string
  minister?: Person
  head?: Person
  contact: Array<ContactItem>
  onlineServices: Array<OrgService>
  associatedDepartments: Array<{
    category?: string
    items: Array<{ name: string; slug?: string }>
  }>
  originalSource: string
  hast: Root
}

// ponytail: frontmatter is cast, not validated — these are the scraped pages
// PR #502 removed, restored verbatim for a review-only preview.
const modules = import.meta.glob<{
  frontmatter: Omit<Org, 'hast'>
  hast: Root
}>('../-data/*.md', { eager: true })

export const ORGS: Array<Org> = Object.values(modules)
  .map(({ frontmatter, hast }) => ({
    ...frontmatter,
    onlineServices: frontmatter.onlineServices.map((service) => ({
      ...service,
      href: resolveServiceHref(service.href),
    })),
    hast,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

export const ORG_BY_SLUG = new Map(ORGS.map((org) => [org.slug, org]))

export const orgHref = (slug: string) => `/government/organisations/${slug}`
