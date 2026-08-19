import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTERS,
  filtersFromParams,
  filtersReducer,
  paramsFromFilters,
} from './finder-filters'
import type { FilterState } from './finder-filters'

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
