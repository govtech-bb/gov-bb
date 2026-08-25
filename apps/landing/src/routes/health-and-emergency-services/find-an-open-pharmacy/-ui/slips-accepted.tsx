/**
 * "Prescription slips accepted" panel for the detail page.
 * One row per slip colour: swatch, accepted/not-accepted mark backed by
 * words, and — for a rejected slip — the nearest pharmacy that takes it.
 */

import { Heading, Link, Text } from '@govtech-bb/react'
import type { Pharmacy } from '../-data/pharmacies'
import { PHARMACIES } from '../-data/pharmacies'
import { formatDistanceKm } from '../-lib/pharmacy-distance'
import { SLIP_COLOURS_HREF } from '../-lib/routes'
import type { SlipColour } from '../-lib/slips'
import { acceptsSlip, nearestAccepting, SLIP_COLOURS, SLIP_LABELS } from '../-lib/slips'
import { CheckIcon, CrossIcon, DashIcon } from './icons'

const SWATCH_CLASSES = {
  white: 'bg-white-00 border-grey-00',
  yellow: 'bg-yellow-40 border-yellow-00',
  green: 'bg-green-10 border-green-00',
} satisfies Record<SlipColour, string>

function slipDescription(pharmacy: Pharmacy, slip: SlipColour): string {
  const accepted = acceptsSlip(pharmacy, slip)
  if (accepted === null) {
    // The page states the unconfirmed status once, up top — rows stay short.
    return 'Not confirmed.'
  }
  if (accepted) {
    if (pharmacy.type === 'government') {
      // QEH-issued slips are filled at government pharmacies for selected
      // medications only — see the slip colours page.
      return slip === 'white'
        ? 'Accepted — medication is free here.'
        : 'Accepted for selected medications — call to check yours is covered.'
    }
    return 'Accepted — a small dispensing fee applies.'
  }
  const nearest = nearestAccepting(pharmacy, slip, PHARMACIES)
  if (nearest) {
    return `Not accepted here. Nearest pharmacy accepting ${slip} is ${nearest.pharmacy.name}, ${nearest.pharmacy.parish} — ${formatDistanceKm(nearest.km)}.`
  }
  return 'Not accepted here. Government polyclinic pharmacies accept it.'
}

function SlipRow({
  pharmacy,
  slip,
}: {
  pharmacy: Pharmacy
  slip: SlipColour
}) {
  const accepted = acceptsSlip(pharmacy, slip)
  const mark =
    accepted === null ? (
      <span className="text-mid-grey-00">
        <DashIcon />
        <span className="sr-only">Not confirmed</span>
      </span>
    ) : accepted ? (
      <span className="text-green-00">
        <CheckIcon />
        <span className="sr-only">Accepted</span>
      </span>
    ) : (
      <span className="text-red-00">
        <CrossIcon />
        <span className="sr-only">Not accepted</span>
      </span>
    )

  return (
    <li className="flex items-start gap-s rounded-lg border border-grey-00 bg-white-00 p-s">
      <span
        aria-hidden="true"
        className={`mt-0.75 h-5 w-8 shrink-0 rounded-sm border ${SWATCH_CLASSES[slip]}`}
      />
      <span className="mt-0.75">{mark}</span>
      <div className="flex flex-col gap-xxs">
        <p className="font-bold">{SLIP_LABELS[slip]}</p>
        <Text as="p" className="text-mid-grey-00" size="body-sm">
          {slipDescription(pharmacy, slip)}
        </Text>
      </div>
    </li>
  )
}

export function SlipsAccepted({ pharmacy }: { pharmacy: Pharmacy }) {
  return (
    <section aria-labelledby="slips-accepted" className="flex flex-col gap-s">
      <Heading as="h2" id="slips-accepted" size="h3">
        Prescription slips accepted
      </Heading>
      <Text as="p" className="text-mid-grey-00">
        Check the colour of the slip your doctor gave you before you travel.{' '}
        <Link href={SLIP_COLOURS_HREF}>What the slip colours mean</Link>
      </Text>
      <ul className="flex list-none flex-col gap-xs p-0">
        {SLIP_COLOURS.map((slip) => (
          <SlipRow key={slip} pharmacy={pharmacy} slip={slip} />
        ))}
      </ul>
    </section>
  )
}
