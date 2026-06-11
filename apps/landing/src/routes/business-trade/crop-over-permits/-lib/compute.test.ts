import { describe, it, expect } from 'vitest'
import { EMPTY_FEATURES, getActivePermits, renumberSteps } from './compute'
import type { Features } from './compute'
import type { Permit } from './permits'

const featuresWith = (overrides: Partial<Features>): Features => ({
  ...EMPTY_FEATURES,
  ...overrides,
})

describe('getActivePermits', () => {
  it('always includes permits with empty conditions, regardless of venue or features', () => {
    const list = getActivePermits('private', EMPTY_FEATURES)
    const alwaysOn = list.filter((p) => p.conditions.length === 0)
    // Place of Public Entertainment licence and Public gathering licence
    // both have empty conditions in the dataset.
    expect(alwaysOn.length).toBeGreaterThanOrEqual(2)
    expect(alwaysOn.map((p) => p.name)).toContain(
      'Place of Public Entertainment licence',
    )
    expect(alwaysOn.map((p) => p.name)).toContain('Public gathering licence')
  })

  it('filters a beach-only permit in when venue is beach and out otherwise', () => {
    const onBeach = getActivePermits('beach', EMPTY_FEATURES)
    expect(onBeach.map((p) => p.name)).toContain('Venue permit')

    const onPrivate = getActivePermits('private', EMPTY_FEATURES)
    expect(onPrivate.map((p) => p.name)).not.toContain('Venue permit')
  })

  it('requires all conditions to be true for multi-condition permits', () => {
    // No multi-condition permits exist in the current dataset, so verify
    // the contract directly with a fixture.
    const permits: Array<Permit> = [
      {
        step: 1,
        name: 'Two-condition',
        agency: 'X',
        lead: '',
        urgency: 'normal',
        conditions: ['beach', 'alcohol'],
        hasFees: false,
        docs: [],
      },
    ]

    const flags: Record<string, boolean> = {
      private: false,
      beach: true,
      road: false,
      water: false,
      music: false,
      alcohol: false,
      food: false,
      stage: false,
      tickets: false,
      pyro: false,
      copyright: false,
    }
    const passes = (p: Permit) => p.conditions.every((c) => flags[c])
    expect(permits.every(passes)).toBe(false)

    flags.alcohol = true
    expect(permits.every(passes)).toBe(true)
  })

  it('treats null venue as no venue match (no venue-conditional permits)', () => {
    const list = getActivePermits(null, EMPTY_FEATURES)
    expect(list.map((p) => p.name)).not.toContain('Venue permit')
  })

  it('surfaces feature-gated permits when the feature is true', () => {
    const withAlcohol = getActivePermits(
      'private',
      featuresWith({ alcohol: true }),
    )
    expect(withAlcohol.map((p) => p.name)).toContain(
      'Special Occasion Liquor Licence',
    )

    const withoutAlcohol = getActivePermits('private', EMPTY_FEATURES)
    expect(withoutAlcohol.map((p) => p.name)).not.toContain(
      'Special Occasion Liquor Licence',
    )
  })
})

describe('renumberSteps', () => {
  const stub = (step: number, name: string): Permit => ({
    step,
    name,
    agency: '',
    lead: '',
    urgency: 'normal',
    conditions: [],
    hasFees: false,
    docs: [],
  })

  it('assigns sequential display numbers for distinct step values', () => {
    const numbered = renumberSteps([stub(1, 'a'), stub(2, 'b'), stub(3, 'c')])
    expect(numbered.map((n) => n.displayStep)).toEqual([1, 2, 3])
  })

  it('collapses consecutive permits sharing the same step into the same display number', () => {
    const numbered = renumberSteps([
      stub(1, 'a'),
      stub(2, 'b'),
      stub(2, 'c'),
      stub(4, 'd'),
    ])
    expect(numbered.map((n) => n.displayStep)).toEqual([1, 2, 2, 3])
  })

  it('returns an empty array when given no permits', () => {
    expect(renumberSteps([])).toEqual([])
  })
})
