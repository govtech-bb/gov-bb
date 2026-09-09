/**
 * Pharmacy result card.
 * --------------------------------------------------------------
 * Reading order: status → name → cost → where → when → caveats → actions.
 * Cost sits second because it is the deciding factor in
 * Barbados - polyclinics are free, private pharmacies charge a dispensing
 * fee. Presentational - no finder state.
 *
 * Everything except the status line is static, so the card is useful
 * before hydration and without JavaScript.
 */

import { Heading, Link, LinkButton, Text } from '@govtech-bb/react'
import type { Pharmacy, PharmacyContent } from '../-data/pharmacies'
import { PHARMACY_CONTENT } from '../-data/pharmacies'
import { formatCopy } from '../-lib/copy'
import { weeklyHoursSummary } from '../-lib/opening-hours'
import { formatDistanceKm } from '../-lib/pharmacy-distance'
import {
  mapsUrl,
  pharmacyDetailHref,
  telHref,
  whatsappHref,
} from '../-lib/routes'
import { Caveat } from './caveat'
import { ClockIcon, MapPinIcon } from './icons'
import { CostChip, StatusLine, StatusSkeleton } from './status-pill'

export function PharmacyCard({
  pharmacy,
  now,
  distanceKm = null,
  printOnly = false,
  content = PHARMACY_CONTENT,
}: {
  pharmacy: Pharmacy
  now: Date | null
  distanceKm?: number | null
  /** Rendered for the printed list only - hidden on screen. */
  printOnly?: boolean
  content?: PharmacyContent
}) {
  const { detail, drugService, hours } = content.copy
  const hasPlace = pharmacy.parish !== 'All parishes'
  const whatsapp = whatsappHref(pharmacy, detail.whatsappMessage)

  return (
    <li
      className={`flex-col gap-3 rounded-lg border border-grey-20 bg-white-00 p-5 ${
        printOnly ? 'hidden print:flex' : 'flex'
      }`}
    >
      {/* Reserved height so the post-mount status line causes no layout shift. */}
      <div className="min-h-5">
        {now ? (
          <StatusLine now={now} pharmacy={pharmacy} content={content} />
        ) : (
          <StatusSkeleton />
        )}
      </div>

      <Heading as="h3" size="h4">
        <Link href={pharmacyDetailHref(pharmacy)}>{pharmacy.name}</Link>
      </Heading>

      <CostChip pharmacy={pharmacy} content={content} />

      <div className="flex flex-col gap-1 text-grey-70">
        <Text as="p" className="inline-flex items-start gap-2" size="body-sm">
          <span className="mt-0.75">
            <MapPinIcon />
          </span>
          {pharmacy.address}
        </Text>
        {distanceKm !== null && (
          <Text
            as="p"
            className="inline-flex items-start gap-2 text-blue-40"
            size="body-sm"
            weight="bold"
          >
            <span className="mt-0.75">
              <MapPinIcon />
            </span>
            {formatDistanceKm(distanceKm)}
          </Text>
        )}
        <Text as="p" className="inline-flex items-start gap-2" size="body-sm">
          <span className="mt-0.75">
            <ClockIcon />
          </span>
          <span className="tabular-nums">
            {pharmacy.hours
              ? weeklyHoursSummary(pharmacy.hours)
              : hours.unknownWeek}
          </span>
        </Text>
      </div>

      {pharmacy.notes && <Caveat tone="confidence">{pharmacy.notes}</Caveat>}

      {pharmacy.pppStatus === 'participating' && (
        <Caveat tone="coverage">{hours.privateSlipWarning}</Caveat>
      )}

      {whatsapp && (
        <Caveat tone="channel">
          <Link external href={whatsapp}>
            {detail.whatsappLabel}
          </Link>
        </Caveat>
      )}

      <div className="flex flex-col gap-xs">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {pharmacy.phone && (
            <LinkButton href={telHref(pharmacy.phone)}>
              {formatCopy(detail.callLabel, { phone: pharmacy.phone })}
            </LinkButton>
          )}
          {hasPlace && (
            <LinkButton external href={mapsUrl(pharmacy)} variant="secondary">
              {detail.cardDirectionsLabel}
            </LinkButton>
          )}
          <LinkButton href={pharmacyDetailHref(pharmacy)} variant="tertiary">
            {detail.fullDetailsLabel}
          </LinkButton>
        </div>
        {pharmacy.phone ? (
          <Text as="p" className="hidden print:block" size="body-sm">
            {formatCopy(detail.callLabel, { phone: pharmacy.phone })}
          </Text>
        ) : (
          <Text as="p" className="text-grey-70" size="body-sm">
            {detail.noPhone}{' '}
            <Link href={telHref(drugService.phone)}>{drugService.phone}</Link>.
          </Text>
        )}
        {pharmacy.phoneExtension && (
          <Text as="p" className="text-grey-70" size="body-sm">
            {formatCopy(detail.extensionMessage, {
              extension: pharmacy.phoneExtension,
            })}
          </Text>
        )}
      </div>
    </li>
  )
}
