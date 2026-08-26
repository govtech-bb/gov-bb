/**
 * Finder filter state — pure and testable.
 * --------------------------------------------------------------
 * One reducer owns the six filter facets; URL parse/serialize live beside
 * it so the shareable-link format has a single definition; matching and
 * sorting are pure functions over the same state.
 */

import type { LatLon, Pharmacy, PharmacyType } from '../-data/pharmacies'
import { pharmacyStatus } from './opening-hours'
import { pharmacyDistanceKm } from './pharmacy-distance'
import type { SlipColour } from './slips'
import { acceptsSlip, SLIP_COLOURS } from './slips'

export type TypeFilter = 'all' | 'government' | 'private-sbs'
export type SlipFilter = SlipColour | 'any'

export interface FilterState {
  search: string
  parishes: string[]
  type: TypeFilter
  slip: SlipFilter
  subsidisedOnly: boolean
  openNow: boolean
}

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  parishes: [],
  type: 'all',
  slip: 'any',
  subsidisedOnly: true,
  openNow: false,
}

export type FilterAction =
  | { type: 'set-search'; value: string }
  | { type: 'toggle-parish'; parish: string }
  | { type: 'clear-parishes' }
  | { type: 'set-type'; value: TypeFilter }
  | { type: 'set-slip'; value: SlipFilter }
  | { type: 'set-subsidised-only'; value: boolean }
  | { type: 'set-open-now'; value: boolean }
  | { type: 'clear-all' }
  | { type: 'hydrate'; value: FilterState }

export function filtersReducer(
  state: FilterState,
  action: FilterAction,
): FilterState {
  switch (action.type) {
    case 'set-search':
      return { ...state, search: action.value }
    case 'toggle-parish':
      return {
        ...state,
        parishes: state.parishes.includes(action.parish)
          ? state.parishes.filter((parish) => parish !== action.parish)
          : [...state.parishes, action.parish],
      }
    case 'clear-parishes':
      return { ...state, parishes: [] }
    case 'set-type':
      return { ...state, type: action.value }
    case 'set-slip':
      return { ...state, slip: action.value }
    case 'set-subsidised-only':
      return { ...state, subsidisedOnly: action.value }
    case 'set-open-now':
      return { ...state, openNow: action.value }
    case 'clear-all':
      return DEFAULT_FILTERS
    case 'hydrate':
      return action.value
  }
}

function parseType(value: string | null): TypeFilter {
  return value === 'government' || value === 'private-sbs' ? value : 'all'
}

function parseSlip(value: string | null): SlipFilter {
  return (SLIP_COLOURS as readonly string[]).includes(value ?? '')
    ? (value as SlipColour)
    : 'any'
}

/** Read a shareable URL back into filter state (unknown values fall back). */
export function filtersFromParams(params: URLSearchParams): FilterState {
  return {
    search: params.get('q') ?? '',
    parishes: params.get('parish')?.split(',').filter(Boolean) ?? [],
    type: parseType(params.get('type')),
    slip: parseSlip(params.get('slip')),
    subsidisedOnly: params.get('all') !== '1',
    openNow: params.get('open') === '1',
  }
}

/** Serialize filter state for the URL — defaults are omitted. */
export function paramsFromFilters(state: FilterState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.search) params.set('q', state.search)
  if (state.parishes.length > 0) params.set('parish', state.parishes.join(','))
  if (state.openNow) params.set('open', '1')
  if (state.type !== 'all') params.set('type', state.type)
  if (state.slip !== 'any') params.set('slip', state.slip)
  if (!state.subsidisedOnly) params.set('all', '1')
  return params
}

export function matchesFilters(
  pharmacy: Pharmacy,
  f: FilterState,
  now: Date | null,
): boolean {
  // The island-wide delivery service serves every parish.
  if (
    f.parishes.length > 0 &&
    pharmacy.parish !== 'All parishes' &&
    !f.parishes.includes(pharmacy.parish)
  ) {
    return false
  }
  if (f.type === 'government' && pharmacy.type !== 'government') {
    return false
  }
  // Exact match: "Private (takes subsidy)" must never admit full-price entries.
  if (f.type === 'private-sbs' && pharmacy.type !== 'private-sbs') {
    return false
  }
  // A slip filter shows only pharmacies that definitely accept that slip —
  // unknown (unconfirmed) is not good enough to send someone travelling.
  if (f.slip !== 'any' && acceptsSlip(pharmacy, f.slip) !== true) {
    return false
  }
  if (f.subsidisedOnly && pharmacy.type === 'unconfirmed') {
    return false
  }
  if (f.openNow && now && pharmacyStatus(pharmacy, now)?.open !== true) {
    return false
  }
  const query = f.search.trim().toLowerCase()
  if (
    query &&
    !(
      pharmacy.name.toLowerCase().includes(query) ||
      pharmacy.parish.toLowerCase().includes(query) ||
      pharmacy.address.toLowerCase().includes(query)
    )
  ) {
    return false
  }
  return true
}

const TYPE_ORDER = {
  government: 0,
  'private-sbs': 1,
  unconfirmed: 2,
} satisfies Record<PharmacyType, number>

const FACILITY_GROUP_ORDER = {
  government: 0,
  'private-sbs': 1,
  unconfirmed: 1,
} satisfies Record<PharmacyType, number>

/**
 * Government/outpatient facilities first, then private pharmacies. Within
 * each group, open facilities come first, followed by the nearest when the
 * user shared their location. Subsidy status and name break remaining ties.
 * Before mount `now` is null, so the server and hydration renders sort
 * identically by type and name.
 */
export function compareForSort(
  a: Pharmacy,
  b: Pharmacy,
  now: Date | null,
  user: LatLon | null,
): number {
  const groupDifference =
    FACILITY_GROUP_ORDER[a.type] - FACILITY_GROUP_ORDER[b.type]
  if (groupDifference !== 0) return groupDifference

  if (now) {
    const aOpen = pharmacyStatus(a, now)?.open === true
    const bOpen = pharmacyStatus(b, now)?.open === true
    if (aOpen !== bOpen) return aOpen ? -1 : 1
  }
  if (user) {
    const da = pharmacyDistanceKm(a, user) ?? Number.POSITIVE_INFINITY
    const db = pharmacyDistanceKm(b, user) ?? Number.POSITIVE_INFINITY
    if (da !== db) return da - db
  }
  if (TYPE_ORDER[a.type] !== TYPE_ORDER[b.type]) {
    return TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
  }
  return a.name.localeCompare(b.name)
}
