/**
 * "Prescriptions accepted" panel for the detail page.
 * One row per slip colour: swatch, accepted/not-accepted mark backed by
 * words, and - for a rejected slip - the nearest pharmacy that takes it.
 */

import { Heading, Link, Text } from '@govtech-bb/react'
import type { Pharmacy, PharmacyContent } from '../-data/pharmacies'
import { PHARMACY_CONTENT } from '../-data/pharmacies'
import { formatCopy } from '../-lib/copy'
import { formatDistanceKm } from '../-lib/pharmacy-distance'
import { SLIP_COLOURS_HREF } from '../-lib/routes'
import type { SlipColour } from '../-lib/slips'
import { acceptsSlip, nearestAccepting, SLIP_COLOURS } from '../-lib/slips'
import { CheckIcon, CrossIcon } from './icons'

const SWATCH_CLASSES = {
  white: 'bg-white-00 border-grey-20',
  yellow: 'bg-yellow-20 border-yellow-80',
  green: 'bg-green-10 border-green-80',
} satisfies Record<SlipColour, string>

function slipDescription(
  pharmacy: Pharmacy,
  slip: SlipColour,
  content: PharmacyContent,
): string {
  const copy = content.copy.slips
  if (pharmacy.pppStatus === 'unconfirmed') {
    return copy.unconfirmed
  }
  if (acceptsSlip(pharmacy, slip)) {
    if (pharmacy.type === 'government') {
      // QEH-issued slips are filled at government pharmacies for selected
      // medications only - see the slip colours page.
      return copy.governmentAccepted
    }
    return copy.privateAccepted
  }
  const nearest = nearestAccepting(pharmacy, slip, content.pharmacies)
  if (nearest) {
    return formatCopy(copy.nearest, {
      colour: slip,
      name: nearest.pharmacy.name,
      parish: nearest.pharmacy.parish,
      distance: formatDistanceKm(nearest.km),
    })
  }
  return slip === 'white' ? copy.whiteFallback : copy.governmentFallback
}

function SlipRow({
  pharmacy,
  slip,
  content,
}: {
  pharmacy: Pharmacy
  slip: SlipColour
  content: PharmacyContent
}) {
  const copy = content.copy.slips
  const mark =
    pharmacy.pppStatus === 'unconfirmed' ? null : acceptsSlip(
        pharmacy,
        slip,
      ) ? (
      <span className="text-green-80">
        <CheckIcon />
        <span className="govbb-visually-hidden">{copy.accepted}</span>
      </span>
    ) : (
      <span className="text-red-80">
        <CrossIcon />
        <span className="govbb-visually-hidden">{copy.notAccepted}</span>
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
          {copy.labels[slip]}
        </Text>
        <Text as="p" className="text-grey-70" size="body-sm">
          {slipDescription(pharmacy, slip, content)}
        </Text>
      </div>
    </li>
  )
}

export function SlipsAccepted({
  pharmacy,
  content = PHARMACY_CONTENT,
}: {
  pharmacy: Pharmacy
  content?: PharmacyContent
}) {
  const copy = content.copy.slips
  return (
    <section aria-labelledby="slips-accepted" className="flex flex-col gap-s">
      <Heading as="h2" id="slips-accepted">
        {copy.heading}
      </Heading>
      <Text as="p" className="text-grey-70">
        {copy.introduction}{' '}
        <Link href={SLIP_COLOURS_HREF}>{copy.helpLabel}</Link>
      </Text>
      <ul className="flex list-none flex-col gap-xs p-0">
        {SLIP_COLOURS.map((slip) => (
          <SlipRow
            key={slip}
            pharmacy={pharmacy}
            slip={slip}
            content={content}
          />
        ))}
      </ul>
    </section>
  )
}
