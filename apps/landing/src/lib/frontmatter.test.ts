import { describe, it, expect } from 'vitest'
import {
  serviceDocToFrontmatter,
  organisationDocToFrontmatter,
  EMPTY_EDITOR_STATE,
  type ServiceDoc,
  type OrganisationDoc,
} from '@govtech-bb/content/map'
import { FrontmatterSchema } from './frontmatter'

// Parity guard: the CMS export mapper (packages/content) is the producer; the
// landing FrontmatterSchema here is the consumer. If a field the mapper emits
// fails to parse here, content arriving in apps/landing/src/content/*.json
// will silently be coerced or dropped — exactly the drift the contract test
// in apps/cms can't catch on its own.

const serviceDoc: ServiceDoc = {
  title: 'Apply for a passport',
  description: 'How to apply.',
  body: EMPTY_EDITOR_STATE,
  categories: [{ slug: 'travel-id-citizenship' }],
  subcategory: { slug: 'youth-development-leadership' },
  startType: 'form',
  formId: 'apply-for-a-passport',
  stage: 'alpha',
  sourceUrl: 'https://www.gov.bb/x',
  updatedAt: '2025-10-24T12:00:00.000Z',
}

describe('frontmatter parity (consumer ↔ producer)', () => {
  it('every field the CMS service mapper emits parses against landing FrontmatterSchema', () => {
    const { data } = serviceDocToFrontmatter(serviceDoc)
    expect(() => FrontmatterSchema.parse(data)).not.toThrow()
  })

  it('updated_at round-trips as a Date through z.coerce.date()', () => {
    const { data } = serviceDocToFrontmatter(serviceDoc)
    const parsed = FrontmatterSchema.parse(data)
    expect(parsed.updated_at).toBeInstanceOf(Date)
  })

  it('start_button shape from the mapper parses against the consumer schema', () => {
    // The mapper threads start_button through unchanged — round-trip the shape
    // the CMS would write to make sure the consumer accepts it.
    const docWithStart: ServiceDoc = {
      ...serviceDoc,
      // Producer mappers don't synthesise start_button on services today (it
      // lives in body content), but the consumer schema must accept it if a
      // future mapper does. Validate the structural contract directly.
    }
    const { data } = serviceDocToFrontmatter(docWithStart)
    const augmented = {
      ...data,
      start_button: { type: 'form' as const, label: 'Start now' },
    }
    expect(() => FrontmatterSchema.parse(augmented)).not.toThrow()
  })

  it('organisation mapper output is service-schema-irrelevant (smoke)', () => {
    // Sanity: org docs use a different consumer path; this test only guards
    // that the org mapper does not throw on a minimal valid input — the
    // shape-level parity for MDA frontmatter is covered in the CMS contract test.
    const org: OrganisationDoc = {
      kind: 'department',
      slug: 'a',
      name: 'A',
      body: EMPTY_EDITOR_STATE,
    }
    expect(() => organisationDocToFrontmatter(org)).not.toThrow()
  })
})
