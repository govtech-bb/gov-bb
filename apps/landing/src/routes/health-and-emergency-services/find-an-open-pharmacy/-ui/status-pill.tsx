/**
 * Status line + cost tag, shared by the result card and the detail page.
 * House vocabulary only: caption-size text, palette colours, 400/700
 * weights. Colour is always backed by the words — never carried alone.
 * Rendered only once the current instant is known (post-mount).
 */

import { Text } from '@govtech-bb/react'
import type { Pharmacy, PharmacyType } from '../-data/pharmacies'
import { PPP_LIST_UPDATED, WEEKDAYS } from '../-data/pharmacies'
import {
  barbadosWallClock,
  formatTime,
  pharmacyStatus,
  toMinutes,
  WEEKDAY_LABELS,
} from '../-lib/opening-hours'

/** "Closes in N min" appears within this many minutes of closing. */
const CLOSING_SOON_MINUTES = 60

function Dot({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`mr-2 inline-block size-2 rounded-full align-middle ${className}`}
    />
  )
}

/**
 * Skeleton for the status slot while the clock is unknown (server render
 * and the instant before hydration).
 */
export function StatusSkeleton() {
  return (
    <p
      aria-hidden="true"
      className="h-4 w-44 max-w-full animate-pulse rounded bg-grey-20 motion-reduce:animate-none"
    />
  )
}

/**
 * One-line open/closed status: green "Open until 5:00 pm", "Closes in
 * 25 min at 5:00 pm" (amber dot), grey "Closed · opens Monday 8:00 am" or
 * "Hours not confirmed". Inline text flow — real spaces, so the line reads
 * and copies correctly.
 */
export function StatusLine({
  pharmacy,
  now,
}: {
  pharmacy: Pharmacy
  now: Date
}) {
  const status = pharmacyStatus(pharmacy, now)

  if (status === null) {
    return (
      <Text as="p" className="font-bold text-grey-70" size="body-sm">
        <Dot className="bg-grey-70" />
        Hours not confirmed
      </Text>
    )
  }

  if (status.open) {
    const wall = barbadosWallClock(now)
    const minutesLeft = toMinutes(status.closes) - wall.minutes
    if (minutesLeft <= CLOSING_SOON_MINUTES) {
      return (
        <Text as="p" className="font-bold" size="body-sm">
          <Dot className="bg-yellow-80" />
          Closes in {minutesLeft} min{' '}
          <span className="font-normal text-grey-70">
            at {formatTime(status.closes)}
          </span>
        </Text>
      )
    }
    return (
      <Text as="p" className="font-bold text-green-80" size="body-sm">
        <Dot className="bg-green-80" />
        Open{' '}
        <span className="font-normal text-grey-70">
          until {formatTime(status.closes)}
        </span>
      </Text>
    )
  }

  const nextOpen = status.nextOpen
  let opensPart: string | null = null
  if (nextOpen) {
    const wall = barbadosWallClock(now)
    const tomorrow = WEEKDAYS[(WEEKDAYS.indexOf(wall.weekday) + 1) % 7]
    if (nextOpen.isToday) {
      opensPart = `opens ${formatTime(nextOpen.opens)}`
    } else if (nextOpen.weekday === tomorrow && nextOpen.opens === '00:00') {
      // "Opens Tuesday midnight" reads as Tuesday night; it means tonight.
      opensPart = 'opens midnight tonight'
    } else {
      opensPart = `opens ${WEEKDAY_LABELS[nextOpen.weekday]} ${formatTime(nextOpen.opens)}`
    }
  }

  return (
    <Text as="p" className="font-bold text-grey-70" size="body-sm">
      <Dot className="bg-grey-70" />
      Closed
      {opensPart && <span className="font-normal"> · {opensPart}</span>}
    </Text>
  )
}

/**
 * What the visit costs — the reader's decision variable, in the house tag
 * grammar (shelter-card Tag: filled tint, rounded-md).
 */
const COST_TAGS = {
  government: {
    label: 'Free — government polyclinic',
    className: 'bg-green-10 text-green-80',
  },
  'private-sbs': {
    label: 'Small fee — private pharmacy',
    className: 'bg-teal-10 text-teal-80',
  },
  private: {
    label: 'Full price — not in the subsidy',
    className: 'bg-grey-20 text-grey-70',
  },
} as const

/** Where the record came from, and how fresh it is. */
const PROVENANCE = {
  'private-sbs': `On the Drug Service Active PPP list, ${PPP_LIST_UPDATED}.`,
  private: 'Not on the Drug Service list of participating pharmacies.',
} satisfies Partial<Record<PharmacyType, string>>

export function provenanceNote(pharmacy: Pharmacy): string | undefined {
  return PROVENANCE[pharmacy.type as keyof typeof PROVENANCE]
}

export function CostChip({ pharmacy }: { pharmacy: Pharmacy }) {
  const cost = COST_TAGS[pharmacy.type]
  return (
    <p
      className={`inline-flex w-fit items-center rounded-md px-3 py-1 font-semibold text-sm ${cost.className}`}
    >
      {cost.label}
    </p>
  )
}
