// Ministries / Departments / State-Bodies (MDA) — unified loader.
//
// All MD files live in ./government/organisations/. Each declares its kind in
// frontmatter (`kind: ministry | department | state-body`). The loader groups
// them by kind, exposes typed entry arrays + body lookup maps.

import type { ReactNode } from 'react'
import type { SerializedEditorState } from 'lexical'

import type {
  AssociatedDepartmentGroup,
  ContactItem,
  FeaturedItem,
  MdaEntry,
  Minister,
  MinistryService,
} from '../lib/mda-types'

export type MinistryCategory = 'ministerial' | 'non-ministerial' | 'agency'
export type OrgKind = 'ministry' | 'department' | 'state-body'

export interface Ministry {
  kind: 'ministry'
  slug: string
  name: string
  category: MinistryCategory
  shortDescription?: string
  intro?: ReactNode
  heroImage?: string
  heroImageAlt?: string
  featured?: FeaturedItem[]
  services?: MinistryService[]
  onlineServices?: MinistryService[]
  minister?: Minister
  contact?: ContactItem[]
  associatedDepartments?: AssociatedDepartmentGroup[]
  originalSource?: string
  keywords?: string[]
}

export type Department = MdaEntry & { kind: 'department' }
export type StateBody = MdaEntry & { kind: 'state-body' }

export interface OrgBody {
  body: SerializedEditorState
  bodyText: string
}

interface Loaded {
  ministries: Ministry[]
  departments: Department[]
  stateBodies: StateBody[]
  bodies: Map<string, OrgBody>
}

function loadAll(): Loaded {
  const modules = import.meta.glob<Record<string, unknown>>(
    './government/organisations/*.json',
    { eager: true, import: 'default' },
  )

  const ministries: Ministry[] = []
  const departments: Department[] = []
  const stateBodies: StateBody[] = []
  const bodies = new Map<string, OrgBody>()

  for (const mod of Object.values(modules)) {
    const { body, bodyText, ...data } = mod as {
      body?: SerializedEditorState
      bodyText?: string
    } & Record<string, unknown>
    const slug = typeof data.slug === 'string' ? data.slug : undefined
    const name = typeof data.name === 'string' ? data.name : undefined
    const kind = typeof data.kind === 'string' ? data.kind : undefined
    if (!slug || !name || !kind) continue
    if (body) bodies.set(slug, { body, bodyText: (bodyText ?? '').trim() })
    if (kind === 'ministry') ministries.push(data as unknown as Ministry)
    else if (kind === 'department')
      departments.push(data as unknown as Department)
    else if (kind === 'state-body')
      stateBodies.push(data as unknown as StateBody)
  }

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name)
  ministries.sort(byName)
  departments.sort(byName)
  stateBodies.sort(byName)

  return { ministries, departments, stateBodies, bodies }
}

const loaded = loadAll()

export const MINISTRIES: Ministry[] = loaded.ministries
export const DEPARTMENTS: Department[] = loaded.departments
export const STATE_BODIES: StateBody[] = loaded.stateBodies

export const BODY_BY_SLUG: ReadonlyMap<string, OrgBody> = loaded.bodies

export const ORG_CATEGORY_LABEL: Record<OrgKind, string> = {
  ministry: 'Ministry',
  department: 'Department',
  'state-body': 'State body',
}
