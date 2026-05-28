import { describe, it, expect } from 'vitest'
import { serviceFrontmatterSchema, mdaFrontmatterSchema } from '@govtech-bb/content/schemas'
import {
  serviceDocToFrontmatter,
  organisationDocToFrontmatter,
  EMPTY_EDITOR_STATE,
  type ServiceDoc,
  type OrganisationDoc,
} from '@govtech-bb/content/map'

const fullService: ServiceDoc = {
  title: 'Apply for a passport',
  description: 'How to apply for a Barbados passport.',
  body: EMPTY_EDITOR_STATE,
  categories: [{ slug: 'travel-id-citizenship' }],
  subcategory: { slug: 'youth-development-leadership' },
  serviceType: 'information',
  stage: 'alpha',
  sourceUrl: 'https://www.gov.bb/Citizens/apply-passport',
  updatedAt: '2025-10-24T12:00:00.000Z',
}

const fullMinistry: OrganisationDoc = {
  kind: 'ministry',
  slug: 'ministry-of-education',
  name: 'Ministry of Education',
  stage: 'alpha',
  body: EMPTY_EDITOR_STATE,
  shortDescription: 'Transforms education.',
  intro: 'An introduction.',
  category: 'ministerial',
  keywords: [{ value: 'MoE' }, { value: 'Education' }],
  leader: {
    name: 'The Hon. Minister',
    role: 'Minister of Education',
  },
  heroImage: { url: '/hero.jpg' },
  social: [
    { platform: 'twitter', url: 'https://twitter.com/moe_bb' },
    { platform: 'facebook', url: 'https://facebook.com/moe.bb' },
  ],
  contact: [
    { blockType: 'email', label: 'Email', value: 'info@mes.gov.bb' },
    { blockType: 'phone', label: 'Telephone', value: '(246) 535-0600' },
    { blockType: 'website', label: 'Website', value: 'https://mes.gov.bb', display: 'mes.gov.bb' },
    {
      blockType: 'address',
      label: 'Address',
      lines: 'Elsie Payne Complex\nConstitution Road\nSt. Michael',
    },
  ],
  onlineServices: [
    {
      blockType: 'linkService',
      title: 'Get a textbook grant',
      href: '/get-a-textbook-grant',
      description: 'Grants.',
    },
    { blockType: 'formService', formId: 'teacher-application', label: 'Apply to teach' },
  ],
  featured: [
    {
      title: 'Featured',
      href: '/featured',
      description: 'A tile.',
      image: { url: '/tile.jpg' },
      imageAlt: 'Tile',
    },
  ],
  // `services` is now a relationship to the services collection; exported with
  // depth it arrives as populated service docs, and the mapper resolves each to
  // { title, href: slug, description }.
  services: [{ slug: 'a-service', title: 'A service', description: 'Does a thing.' }],
  associatedDepartments: [
    {
      category: 'Departments',
      items: [{ name: 'School Meals', slug: 'school-meals' }, { name: 'Unlinked body' }],
    },
  ],
  originalSource: 'https://www.gov.bb/Ministries/education',
}

const fullDepartment: OrganisationDoc = {
  kind: 'department',
  slug: 'school-meals',
  name: 'School Meals Department',
  body: EMPTY_EDITOR_STATE,
  shortDescription: 'Feeds schoolchildren.',
  leader: { name: 'The Head', role: 'Director' },
  contact: [{ blockType: 'phone', label: 'Phone', value: '(246) 000-0000' }],
}

describe('content export contract', () => {
  it('service export satisfies the canonical service schema', () => {
    const { data } = serviceDocToFrontmatter(fullService)
    expect(() => serviceFrontmatterSchema.parse(data)).not.toThrow()
  })

  it('service export returns the Lexical body editor state alongside the frontmatter', () => {
    const { data, body } = serviceDocToFrontmatter(fullService)
    // `data` is the structured frontmatter (validated below); `body` is the
    // raw Lexical editor state the JSON artifact embeds for the landing renderer.
    expect(body.root).toBeDefined()
    expect(Array.isArray(body.root.children)).toBe(true)
    expect(() => serviceFrontmatterSchema.parse(data)).not.toThrow()
  })

  it('ministry export satisfies the canonical MDA schema', () => {
    const { data } = organisationDocToFrontmatter(fullMinistry)
    const parsed = mdaFrontmatterSchema.parse(data)
    expect(parsed.minister?.name).toBe('The Hon. Minister')
    expect(parsed.contact).toHaveLength(4)
  })

  it('ministry services relationship resolves to { title, href: /slug, description }', () => {
    const { data } = organisationDocToFrontmatter(fullMinistry)
    // href is slash-prefixed so the landing's resolveServiceHref resolves the
    // slug to its category-prefixed URL (a bare slug would return unresolved).
    expect(data.services).toEqual([
      { title: 'A service', href: '/a-service', description: 'Does a thing.' },
    ])
  })

  it('department export maps leader to `head`, not `minister`', () => {
    const { data } = organisationDocToFrontmatter(fullDepartment)
    const parsed = mdaFrontmatterSchema.parse(data)
    expect(parsed.head?.name).toBe('The Head')
    expect(parsed.minister).toBeUndefined()
  })

  it('address contact expands to a string array', () => {
    const { data } = organisationDocToFrontmatter(fullMinistry)
    const parsed = mdaFrontmatterSchema.parse(data)
    const address = parsed.contact.find((c) => c.type === 'address')
    expect(address?.value).toEqual(['Elsie Payne Complex', 'Constitution Road', 'St. Michael'])
  })
})
