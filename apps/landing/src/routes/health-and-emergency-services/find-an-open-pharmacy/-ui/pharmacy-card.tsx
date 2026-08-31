/**
 * Pharmacy result card.
 * --------------------------------------------------------------
 * Reading order: status → name → cost → where → when → caveats → actions.
 * Cost sits second because it is the deciding factor in
 * Barbados — polyclinics are free, private pharmacies charge a dispensing
 * fee. Presentational — no finder state.
 *
 * Everything except the status line is static, so the card is useful
 * before hydration and without JavaScript.
 */

import { Heading, Link, LinkButton, Text } from '@govtech-bb/react'
import type { Pharmacy } from '../-data/pharmacies'
import { weeklyHoursSummary } from '../-lib/opening-hours'
import { formatDistanceKm } from '../-lib/pharmacy-distance'
import {
  DRUG_SERVICE_PHONE,
  mapsUrl,
  pharmacyDetailHref,
  telHref,
  whatsappHref,
} from '../-lib/routes'
import { Caveat } from './caveat'
import { ClockIcon, MapPinIcon } from './icons'
import {
  CostChip,
  StatusLine,
  StatusSkeleton,
  provenanceNote,
} from './status-pill'

export function PharmacyCard({
  pharmacy,
  now,
  distanceKm = null,
  printOnly = false,
}: {
  pharmacy: Pharmacy
  now: Date | null
  distanceKm?: number | null
  /** Rendered for the printed list only — hidden on screen. */
  printOnly?: boolean
}) {
  const hasPlace = pharmacy.parish !== 'All parishes'

  return (
    <li
      className={`flex-col gap-3 rounded-lg border border-grey-00 bg-white-00 p-5 ${
        printOnly ? 'hidden print:flex' : 'flex'
      }`}
    >
      {/* Reserved height so the post-mount status line causes no layout shift. */}
      <div className="min-h-5">
        {now ? (
          <StatusLine now={now} pharmacy={pharmacy} />
        ) : (
          <StatusSkeleton />
        )}
      </div>

      <Heading as="h3" size="h4">
        <Link href={pharmacyDetailHref(pharmacy.name)}>{pharmacy.name}</Link>
      </Heading>

      <CostChip pharmacy={pharmacy} />

      <div className="flex flex-col gap-1 text-mid-grey-00 text-sm">
        <p className="inline-flex items-start gap-2">
          <span className="mt-0.75">
            <MapPinIcon />
          </span>
          {pharmacy.address}
        </p>
        {distanceKm !== null && (
          <p className="inline-flex items-start gap-2 font-semibold text-blue-100">
            <span className="mt-0.75">
              <MapPinIcon />
            </span>
            {formatDistanceKm(distanceKm)}
          </p>
        )}
        <p className="inline-flex items-start gap-2">
          <span className="mt-0.75">
            <ClockIcon />
          </span>
          <span className="tabular-nums">
            {pharmacy.hours
              ? weeklyHoursSummary(pharmacy.hours)
              : 'Call to confirm opening hours'}
          </span>
        </p>
      </div>

      {pharmacy.notes && <Caveat tone="confidence">{pharmacy.notes}</Caveat>}

      {pharmacy.type === 'private-sbs' && (
        <Caveat tone="coverage">
          Yellow or green (GEHP) prescriptions are not covered here — you would
          pay full price.
        </Caveat>
      )}

      {whatsappHref(pharmacy) && (
        <Caveat tone="channel">
          <Link external href={whatsappHref(pharmacy) as string}>
            Order prescription via WhatsApp (opens in a new tab)
          </Link>
        </Caveat>
      )}

      <div className="flex flex-col gap-xs">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {pharmacy.phone && (
            <LinkButton href={telHref(pharmacy.phone)}>
              Call {pharmacy.phone}
            </LinkButton>
          )}
          {hasPlace && (
            <LinkButton external href={mapsUrl(pharmacy)} variant="secondary">
              Directions
            </LinkButton>
          )}
          <LinkButton
            href={pharmacyDetailHref(pharmacy.name)}
            variant="tertiary"
          >
            Full details
          </LinkButton>
        </div>
        {pharmacy.phone ? (
          <p className="hidden print:block">Call {pharmacy.phone}</p>
        ) : (
          <Text as="p" className="text-mid-grey-00" size="body-sm">
            No number listed. Call the Drug Service on{' '}
            <Link href={telHref(DRUG_SERVICE_PHONE)}>{DRUG_SERVICE_PHONE}</Link>
            .
          </Text>
        )}
        <Text as="p" className="font-medium text-mid-grey-00" size="body-sm">
          {provenanceNote(pharmacy)}
        </Text>
      </div>
    </li>
  )
}
