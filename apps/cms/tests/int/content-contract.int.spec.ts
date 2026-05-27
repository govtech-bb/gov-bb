import { describe, it, expect } from 'vitest'
import { serviceFrontmatterSchema, mdaFrontmatterSchema } from '@govtech-bb/content/schemas'
import {
  serviceDocToFrontmatter,
  organisationDocToFrontmatter,
  type ServiceDoc,
  type OrganisationDoc,
} from '@/lib/frontmatter-map'

const fullService: ServiceDoc = {
  title: 'Apply for a passport',
  description: 'How to apply for a Barbados passport.',
  body: '## How to apply\n\nVisit the Immigration Department.',
  categories: [{ slug: 'travel-id-citizenship' }],
  subcategory: { slug: 'youth-development-leadership' },
  serviceType: 'information',
  stage: 'alpha',
  featured: true,
  section: 'Travel, ID and Citizenship',
  formId: 'passport-application',
  sourceUrl: 'https://www.gov.bb/Citizens/apply-passport',
  publishDate: '2025-10-24',
}

const fullMinistry: OrganisationDoc = {
  kind: 'ministry',
  slug: 'ministry-of-education',
  name: 'Ministry of Education',
  body: 'Body content.',
  shortDescription: 'Transforms education.',
  intro: 'An introduction.',
  category: 'ministerial',
  keywords: [{ value: 'MoE' }, { value: 'Education' }],
  leader: {
    name: 'The Hon. Minister',
    role: 'Minister of Education',
    photo: { url: '/minister.jpg' },
  },
  heroImage: { url: '/hero.jpg' },
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
  services: [{ title: 'A service', href: '/a-service', description: 'Does a thing.' }],
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
  body: 'Body.',
  shortDescription: 'Feeds schoolchildren.',
  leader: { name: 'The Head', role: 'Director' },
  contact: [{ blockType: 'phone', label: 'Phone', value: '(246) 000-0000' }],
}

describe('content export contract', () => {
  it('service export satisfies the canonical service schema', () => {
    const { data } = serviceDocToFrontmatter(fullService)
    expect(() => serviceFrontmatterSchema.parse(data)).not.toThrow()
  })

  it('ministry export satisfies the canonical MDA schema', () => {
    const { data } = organisationDocToFrontmatter(fullMinistry)
    const parsed = mdaFrontmatterSchema.parse(data)
    expect(parsed.minister?.name).toBe('The Hon. Minister')
    expect(parsed.contact).toHaveLength(4)
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
