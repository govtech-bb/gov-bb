/**
 * No-results state: names why nothing matched, then offers a way back for
 * each filter that excluded something - with the count it would restore
 * ("never a dead end").
 */

import { Heading, Text } from '@govtech-bb/react'
import { PHARMACY_CONTENT } from '../-data/pharmacies'
import type { PharmacyContent, PharmacyCopy } from '../-data/pharmacies'
import { formatCopy } from '../-lib/copy'
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
  content = PHARMACY_CONTENT,
}: {
  filters: FilterState
  now: Date | null
  dispatch: (action: FilterAction) => void
  content?: PharmacyContent
}) {
  const copy = content.copy.noResults
  const matchCount = (count: number) =>
    formatCopy(copy.matchCount, {
      count,
      total: content.pharmacies.length,
    })
  const relaxed = (overrides: Partial<FilterState>) => {
    const relaxedFilters = { ...filters, ...overrides }
    return content.pharmacies.filter((pharmacy) =>
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
        ? ` ${formatCopy(copy.nextOpening, {
            name: next.pharmacy.name,
            day: next.isToday ? '' : `${WEEKDAY_LABELS[next.weekday]} `,
            time: formatTime(next.opens),
          })}`
        : ''
      hatches.push({
        key: 'closed',
        label: copy.includeOtherHours,
        caption: `${matchCount(closedMatches.length)}${opensAt}`,
        action: { type: 'set-open-now', value: false },
      })
    }
  }

  if (filters.parishes.length > 0) {
    const anyParish = relaxed({ parishes: [] })
    if (anyParish.length > 0) {
      hatches.push({
        key: 'parishes',
        label: copy.searchAllParishes,
        caption: matchCount(anyParish.length),
        action: { type: 'clear-parishes' },
      })
    }
  }

  if (filters.type !== 'all') {
    const anyType = relaxed({ type: 'all' })
    if (anyType.length > 0) {
      hatches.push({
        key: 'type',
        label: copy.includeTypes,
        caption: matchCount(anyType.length),
        action: { type: 'set-type', value: 'all' },
      })
    }
  }

  if (filters.slip !== 'any') {
    const anySlip = relaxed({ slip: 'any' })
    if (anySlip.length > 0) {
      hatches.push({
        key: 'slip',
        label: copy.anySlip,
        caption: `${matchCount(anySlip.length)} ${copy.checkPrescription}`,
        action: { type: 'set-slip', value: 'any' },
      })
    }
  }
  if (filters.subsidisedOnly) {
    const allMatches = relaxed({ subsidisedOnly: false })
    if (allMatches.length > 0) {
      hatches.push({
        key: 'subsidised',
        label: copy.allListed,
        caption: `${matchCount(allMatches.length)} ${copy.checkParticipation}`,
        action: { type: 'set-subsidised-only', value: false },
      })
    }
  }

  if (filters.search.trim()) {
    const withoutSearch = relaxed({ search: '' })
    if (withoutSearch.length > 0) {
      hatches.push({
        key: 'search',
        label: formatCopy(copy.clearSearch, { query: filters.search.trim() }),
        caption: matchCount(withoutSearch.length),
        action: { type: 'set-search', value: '' },
      })
    }
  }

  // Relaxing one filter alone restores nothing - offer the full reset.
  if (hatches.length === 0) {
    hatches.push({
      key: 'all',
      label: content.copy.finder.resetFiltersLabel,
      caption: copy.resetDescription,
      action: { type: 'clear-all' },
    })
  }

  return (
    <div className="flex flex-col gap-s rounded-lg bg-grey-20 p-s">
      <Heading as="h3" size="h4">
        {copy.heading}
      </Heading>
      <Text as="p">{noResultsReason(filters, copy)}</Text>
      <ul className="flex list-none flex-col gap-xs p-0">
        {hatches.map((hatch) => (
          <li key={hatch.key}>
            <button
              className="flex w-full flex-col gap-xxs rounded-md bg-white-00 p-s text-left outline-offset-2 hover:outline hover:outline-2 hover:outline-green-80"
              onClick={() => dispatch(hatch.action)}
              type="button"
            >
              <Text as="span" className="text-green-80 underline" weight="bold">
                {hatch.label}
              </Text>
              <Text as="span" className="text-grey-70" size="body-sm">
                {hatch.caption}
              </Text>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function noResultsReason(
  filters: FilterState,
  copy: PharmacyCopy['noResults'],
): string {
  const query = filters.search.trim()
  const parts = [
    filters.type === 'government'
      ? copy.governmentNone
      : filters.type === 'private-sbs'
        ? copy.privateNone
        : copy.none,
  ]
  if (query) {
    parts.push(formatCopy(copy.query, { query }))
  }
  if (filters.slip !== 'any') {
    parts.push(formatCopy(copy.slip, { colour: filters.slip }))
  }
  if (filters.parishes.length > 0) {
    parts.push(
      formatCopy(copy.parishes, { parishes: listJoin(filters.parishes) }),
    )
  }
  parts.push(filters.openNow ? copy.noneOpen : copy.noneFound)
  if (filters.subsidisedOnly && filters.type !== 'government') {
    parts.push(copy.subsidisedOnly)
  }
  return parts.join(' ')
}

function listJoin(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? ''
  }
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`
}
