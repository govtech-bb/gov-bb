import { describe, expect, it } from 'vitest'
import type { Pharmacy, WeeklyHours } from '../-data/pharmacies'
import {
  compareForSort,
  DEFAULT_FILTERS,
  filtersFromParams,
  filtersReducer,
  paramsFromFilters,
} from './finder-filters'
import type { FilterState } from './finder-filters'

const CLOSED_ALL_WEEK: WeeklyHours = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
}

function pharmacy(
  name: string,
  type: Pharmacy['type'],
  overrides: Partial<Pharmacy> = {},
): Pharmacy {
  return {
    name,
    type,
    parish: 'St. Michael',
    address: 'Bridgetown',
    phone: '(246) 536-0000',
    ...overrides,
  }
}

describe('filtersReducer', () => {
  it('toggles a parish on and off', () => {
    const on = filtersReducer(DEFAULT_FILTERS, {
      type: 'toggle-parish',
      parish: 'St. Lucy',
    })
    expect(on.parishes).toEqual(['St. Lucy'])
    const off = filtersReducer(on, {
      type: 'toggle-parish',
      parish: 'St. Lucy',
    })
    expect(off.parishes).toEqual([])
  })

  it('clear-all restores every default, including subsidised-only ON', () => {
    let state: FilterState = DEFAULT_FILTERS
    state = filtersReducer(state, { type: 'set-search', value: 'oistins' })
    state = filtersReducer(state, { type: 'set-type', value: 'government' })
    state = filtersReducer(state, { type: 'set-slip', value: 'yellow' })
    state = filtersReducer(state, { type: 'set-subsidised-only', value: false })
    state = filtersReducer(state, { type: 'set-open-now', value: true })
    expect(filtersReducer(state, { type: 'clear-all' })).toEqual(
      DEFAULT_FILTERS,
    )
  })
})

describe('URL round-trip', () => {
  it('default state serializes to an empty query', () => {
    expect(paramsFromFilters(DEFAULT_FILTERS).toString()).toBe('')
  })

  it('parse(serialize(state)) is identity for a full state', () => {
    const state: FilterState = {
      search: 'collins',
      parishes: ['St. Michael', 'Christ Church'],
      type: 'private-sbs',
      slip: 'white',
      subsidisedOnly: false,
      openNow: true,
    }
    expect(filtersFromParams(paramsFromFilters(state))).toEqual(state)
  })

  it('falls back on unknown type and slip values', () => {
    const params = new URLSearchParams('type=hospital&slip=purple')
    const state = filtersFromParams(params)
    expect(state.type).toBe('all')
    expect(state.slip).toBe('any')
  })
})

describe('compareForSort', () => {
  it('keeps government facilities before private pharmacies', () => {
    const now = new Date('2026-08-19T18:30:00Z')
    const user = { lat: 13.1, lon: -59.5 }
    const closedGovernment = pharmacy('Government clinic', 'government', {
      hours: CLOSED_ALL_WEEK,
      coords: { lat: 13.2, lon: -59.6 },
    })
    const openNearbyPrivate = pharmacy('Private pharmacy', 'private-sbs', {
      hours: {
        ...CLOSED_ALL_WEEK,
        wed: [{ opens: '08:00', closes: '18:00' }],
      },
      coords: user,
    })

    expect(
      [openNearbyPrivate, closedGovernment]
        .sort((a, b) => compareForSort(a, b, now, user))
        .map((entry) => entry.name),
    ).toEqual(['Government clinic', 'Private pharmacy'])
  })

  it('keeps participating and full-price private pharmacies in one group', () => {
    const government = pharmacy('Zulu clinic', 'government')
    const participating = pharmacy('Zulu private', 'private-sbs')
    const fullPrice = pharmacy('Alpha private', 'private')

    expect(
      [fullPrice, participating, government]
        .sort((a, b) => compareForSort(a, b, null, null))
        .map((entry) => entry.type),
    ).toEqual(['government', 'private-sbs', 'private'])
  })
})
