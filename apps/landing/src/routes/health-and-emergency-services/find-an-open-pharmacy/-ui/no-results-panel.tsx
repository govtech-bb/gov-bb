/**
 * No-results state: names why nothing matched, then offers a way back for
 * each filter that excluded something — with the count it would restore
 * ("never a dead end").
 */

import { Heading, Text } from '@govtech-bb/react'
import { PHARMACIES, PHARMACY_COUNT } from '../-data/pharmacies'
import type { FilterAction, FilterState } from '../-lib/finder-filters'
import { matchesFilters } from '../-lib/finder-filters'
import {
  formatTime,
  soonestOpening,
  WEEKDAY_LABELS,
} from '../-lib/opening-hours'

export function NoResultsPanel({
  filters,
  now,
  dispatch,
}: {
  filters: FilterState
  now: Date | null
  dispatch: (action: FilterAction) => void
}) {
  const relaxed = (overrides: Partial<FilterState>) => {
    const relaxedFilters = { ...filters, ...overrides }
    return PHARMACIES.filter((pharmacy) =>
      matchesFilters(pharmacy, relaxedFilters, now),
    )
  }

  const hatches: {
    key: string
    label: string
    caption: string
    action: FilterAction
  }[] = []

  if (filters.openNow && now) {
    const closedMatches = relaxed({ openNow: false })
    if (closedMatches.length > 0) {
      const next = soonestOpening(closedMatches, now)
      const opensAt = next
        ? ` ${next.pharmacy.name} opens ${
            next.isToday ? '' : `${WEEKDAY_LABELS[next.weekday]} `
          }${formatTime(next.opens)}.`
        : ''
      hatches.push({
        key: 'closed',
        label: 'Show pharmacies that are closed now',
        caption: `${closedMatches.length} of the ${PHARMACY_COUNT} pharmacies would match.${opensAt}`,
        action: { type: 'set-open-now', value: false },
      })
    }
  }

  if (filters.parishes.length > 0) {
    const anyParish = relaxed({ parishes: [] })
    if (anyParish.length > 0) {
      const stLucy = filters.parishes.includes('St. Lucy')
        ? ' St. Lucy has no pharmacy listed — the nearest are in Speightstown, St. Peter.'
        : ''
      hatches.push({
        key: 'parishes',
        label: 'Search all parishes',
        caption: `${anyParish.length} of the ${PHARMACY_COUNT} pharmacies would match.${stLucy}`,
        action: { type: 'clear-parishes' },
      })
    }
  }

  if (filters.type !== 'all') {
    const anyType = relaxed({ type: 'all' })
    if (anyType.length > 0) {
      hatches.push({
        key: 'type',
        label: 'Include government and private pharmacies',
        caption: `${anyType.length} of the ${PHARMACY_COUNT} pharmacies would match.`,
        action: { type: 'set-type', value: 'all' },
      })
    }
  }

  if (filters.slip !== 'any') {
    const anySlip = relaxed({ slip: 'any' })
    if (anySlip.length > 0) {
      hatches.push({
        key: 'slip',
        label: 'Show pharmacies for any prescription colour',
        caption: `${anySlip.length} of the ${PHARMACY_COUNT} pharmacies would match — check your prescription is accepted before you travel.`,
        action: { type: 'set-slip', value: 'any' },
      })
    }
  }

  if (filters.subsidisedOnly) {
    const includingFullPrice = relaxed({ subsidisedOnly: false })
    if (includingFullPrice.length > 0) {
      hatches.push({
        key: 'subsidised',
        label: 'Include pharmacies outside the subsidy',
        caption: `${includingFullPrice.length} of the ${PHARMACY_COUNT} pharmacies would match — they are not in the subsidy, so you pay the full price.`,
        action: { type: 'set-subsidised-only', value: false },
      })
    }
  }

  if (filters.search.trim()) {
    const withoutSearch = relaxed({ search: '' })
    if (withoutSearch.length > 0) {
      hatches.push({
        key: 'search',
        label: `Clear your search “${filters.search.trim()}”`,
        caption: `${withoutSearch.length} of the ${PHARMACY_COUNT} pharmacies would match.`,
        action: { type: 'set-search', value: '' },
      })
    }
  }

  // Relaxing one filter alone restores nothing — offer the full reset.
  if (hatches.length === 0) {
    hatches.push({
      key: 'all',
      label: 'Clear all filters',
      caption: `Show all ${PHARMACY_COUNT} pharmacies.`,
      action: { type: 'clear-all' },
    })
  }

  return (
    <div className="flex flex-col gap-s rounded-lg bg-grey-00 p-s">
      <Heading as="h3" size="h4">
        No pharmacies match your search
      </Heading>
      <Text as="p">{noResultsReason(filters)}</Text>
      <ul className="flex list-none flex-col gap-xs p-0">
        {hatches.map((hatch) => (
          <li key={hatch.key}>
            <button
              className="flex w-full flex-col gap-xxs rounded-md bg-white-00 p-s text-left outline-offset-2 hover:outline hover:outline-2 hover:outline-green-00"
              onClick={() => dispatch(hatch.action)}
              type="button"
            >
              <span className="font-semibold text-green-00 underline">
                {hatch.label}
              </span>
              <Text as="span" className="text-mid-grey-00" size="body-sm">
                {hatch.caption}
              </Text>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function noResultsReason(filters: FilterState): string {
  const query = filters.search.trim()
  let sentence =
    filters.type === 'government'
      ? 'No government pharmacies'
      : filters.type === 'private-sbs'
        ? 'No private pharmacies'
        : 'No pharmacies'
  if (query) {
    sentence += ` matching “${query}”`
  }
  if (filters.slip !== 'any') {
    sentence += ` accepting a ${filters.slip} prescription`
  }
  if (filters.parishes.length > 0) {
    sentence += ` in ${listJoin(filters.parishes)}`
  }
  sentence += filters.openNow ? ' are open right now.' : ' were found.'
  if (filters.subsidisedOnly && filters.type !== 'government') {
    sentence += ' Pharmacies outside the subsidy were hidden.'
  }
  return sentence
}

function listJoin(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? ''
  }
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}
