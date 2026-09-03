/**
 * "Prescriptions accepted" panel for the detail page.
 * One row per slip colour: swatch, accepted/not-accepted mark backed by
 * words, and - for a rejected slip - the nearest pharmacy that takes it.
 */

import { Heading, Link, Text } from '@govtech-bb/react'
import type { Pharmacy } from '../-data/pharmacies'
import { PHARMACIES } from '../-data/pharmacies'
import { formatDistanceKm } from '../-lib/pharmacy-distance'
import { SLIP_COLOURS_HREF } from '../-lib/routes'
import type { SlipColour } from '../-lib/slips'
import {
  acceptsSlip,
  nearestAccepting,
  SLIP_COLOURS,
  SLIP_LABELS,
} from '../-lib/slips'
import { CheckIcon, CrossIcon } from './icons'

const SWATCH_CLASSES = {
  white: 'bg-white-00 border-grey-20',
  yellow: 'bg-yellow-20 border-yellow-80',
  green: 'bg-green-10 border-green-80',
} satisfies Record<SlipColour, string>

function slipDescription(pharmacy: Pharmacy, slip: SlipColour): string {
  if (acceptsSlip(pharmacy, slip)) {
    if (pharmacy.type === 'government') {
      // QEH-issued slips are filled at government pharmacies for selected
      // medications only - see the slip colours page.
      return 'Accepted for selected medications. Call to check yours is covered.'
    }
    return 'Accepted. A small dispensing fee applies.'
  }
  const nearest = nearestAccepting(pharmacy, slip, PHARMACIES)
  if (nearest) {
    return `Not accepted here. Nearest pharmacy accepting ${slip} is ${nearest.pharmacy.name}, ${nearest.pharmacy.parish}, ${formatDistanceKm(nearest.km)}.`
  }
  return slip === 'white'
    ? 'Not accepted here. Participating private pharmacies accept it.'
    : 'Not accepted here. Government polyclinic pharmacies accept it.'
}

function SlipRow({ pharmacy, slip }: { pharmacy: Pharmacy; slip: SlipColour }) {
  const mark = acceptsSlip(pharmacy, slip) ? (
    <span className="text-green-80">
      <CheckIcon />
      <span className="govbb-visually-hidden">Accepted</span>
    </span>
  ) : (
    <span className="text-red-80">
      <CrossIcon />
      <span className="govbb-visually-hidden">Not accepted</span>
    </span>
  )

  return (
    <li className="flex items-start gap-s rounded-lg border border-grey-20 bg-white-00 p-s">
      <span
        aria-hidden="true"
        className={`mt-0.75 h-5 w-8 shrink-0 rounded-sm border ${SWATCH_CLASSES[slip]}`}
      />
      <span className="mt-0.75">{mark}</span>
      <div className="flex flex-col gap-xxs">
        <Text as="p" weight="bold">
          {SLIP_LABELS[slip]}
        </Text>
        <Text as="p" className="text-grey-70" size="body-sm">
          {slipDescription(pharmacy, slip)}
        </Text>
      </div>
    </li>
  )
}

export function SlipsAccepted({ pharmacy }: { pharmacy: Pharmacy }) {
  return (
    <section aria-labelledby="slips-accepted" className="flex flex-col gap-s">
      <Heading as="h2" id="slips-accepted">
        Prescriptions accepted
      </Heading>
      <Text as="p" className="text-grey-70">
        Check the colour of the prescription your doctor gave you before you
        travel.{' '}
        <Link href={SLIP_COLOURS_HREF}>What prescription colours mean</Link>
      </Text>
      <ul className="flex list-none flex-col gap-xs p-0">
        {SLIP_COLOURS.map((slip) => (
          <SlipRow key={slip} pharmacy={pharmacy} slip={slip} />
        ))}
      </ul>
    </section>
  )
}
