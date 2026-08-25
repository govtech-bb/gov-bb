/**
 * Pharmacy detail page — the canonical, shareable page for one pharmacy.
 * --------------------------------------------------------------
 * Body for /health-and-emergency-services/find-an-open-pharmacy/<slug>.
 * Single column in the house shape (max-w-2xl, 56→40→20/16px register),
 * like every sibling content surface: identity → actions → hours → slips →
 * contact and provenance. Everything except the status line is static and
 * server-rendered, so a shared link is fully useful without JavaScript.
 */

import { Heading, Link, LinkButton, Text } from '@govtech-bb/react'
import { format, parseISO } from 'date-fns'
import { useEffect, useState } from 'react'
import type { Pharmacy } from '../-data/pharmacies'
import {
  PHARMACIES_LAST_UPDATED,
  PHARMACIES_NEXT_REVIEW,
  REGISTER_VERIFIED,
} from '../-data/pharmacies'
import { barbadosWallClock } from '../-lib/opening-hours'
import {
  DRUG_SERVICE_PHONE,
  mapsUrl,
  telHref,
  whatsappHref,
} from '../-lib/routes'
import { Caveat } from './caveat'
import { MapPinIcon } from './icons'
import { SlipsAccepted } from './slips-accepted'
import { CostChip, StatusLine, StatusSkeleton } from './status-pill'
import { WeeklyHoursRows } from './weekly-hours'

export function PharmacyDetailPage({ pharmacy }: { pharmacy: Pharmacy }) {
  // Post-mount only, so server and hydration markup match (same approach as
  // the finder). Ticks each minute so the status stays honest.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const today = now ? barbadosWallClock(now).weekday : null
  const hasPlace = pharmacy.parish !== 'All parishes'
  const whatsapp = whatsappHref(pharmacy)

  return (
    <div className="mb-l flex max-w-2xl flex-col gap-m">
      <div className="flex flex-col gap-xs">
        <Heading as="h1">{pharmacy.name}</Heading>
        <div className="border-blue-10 border-b-4 pb-4 text-mid-grey-00">
          <Text as="p" size="caption">
            Last updated on {format(parseISO(PHARMACIES_LAST_UPDATED), 'PPP')}.
            Next review: {format(parseISO(PHARMACIES_NEXT_REVIEW), 'PPP')}.
          </Text>
        </div>
        <div className="min-h-5">
          {now ? (
            <StatusLine now={now} pharmacy={pharmacy} />
          ) : (
            <StatusSkeleton />
          )}
        </div>
        <CostChip pharmacy={pharmacy} />
        <Text as="p" className="inline-flex items-baseline gap-2">
          <MapPinIcon />
          {pharmacy.address}
        </Text>
      </div>

      {pharmacy.type === 'unconfirmed' && (
        <Caveat>
          This pharmacy has not been confirmed with the Drug Service — call to
          check prices and hours before you travel.
        </Caveat>
      )}

      <div className="flex flex-wrap items-center gap-s">
        {hasPlace && (
          <LinkButton external href={mapsUrl(pharmacy)}>
            Get directions
          </LinkButton>
        )}
        {pharmacy.phone && (
          <LinkButton href={telHref(pharmacy.phone)} variant="secondary">
            Call {pharmacy.phone}
          </LinkButton>
        )}
      </div>
      {!pharmacy.phone && (
        <Text as="p">
          No number listed. Call the Drug Service on{' '}
          <Link href={telHref(DRUG_SERVICE_PHONE)}>{DRUG_SERVICE_PHONE}</Link>
          .
        </Text>
      )}

      <section aria-labelledby="opening-times" className="flex flex-col gap-s">
        <Heading as="h2" id="opening-times">
          Opening times
        </Heading>
        {pharmacy.hours ? (
          <WeeklyHoursRows hours={pharmacy.hours} today={today} />
        ) : (
          <Caveat tone="confidence">
            Opening hours have not been confirmed — call before you go.
          </Caveat>
        )}
        {pharmacy.notes && <Caveat tone="confidence">{pharmacy.notes}</Caveat>}
        <div className="border-blue-100 border-l-4 bg-blue-10 px-s py-xm">
          <Text as="p">
            <strong>Public holidays:</strong> many pharmacies close or shorten
            their hours on public holidays. Call before you go.
          </Text>
        </div>
      </section>

      <SlipsAccepted pharmacy={pharmacy} />

      <Caveat>
        <strong>If your prescription is refused:</strong> contact the Drug
        Service before you pay. Do not pay full price on the assumption the
        refusal is correct. Call the Drug Service on{' '}
        <Link href={telHref(DRUG_SERVICE_PHONE)}>{DRUG_SERVICE_PHONE}</Link>.
      </Caveat>

      <section
        aria-labelledby="contact-and-help"
        className="flex flex-col gap-s"
      >
        <Heading as="h2" id="contact-and-help">
          Contact and help
        </Heading>
        {pharmacy.phone && (
          <Text as="p">
            Telephone:{' '}
            <Link href={telHref(pharmacy.phone)}>{pharmacy.phone}</Link>
          </Text>
        )}
        {whatsapp && (
          <Caveat tone="channel">
            <Link external href={whatsapp}>
              Order prescription via WhatsApp (opens in a new tab)
            </Link>
          </Caveat>
        )}
        <Text as="p" className="text-mid-grey-00" size="caption">
          {pharmacy.type === 'unconfirmed'
            ? 'Drawn from a wider public pharmacy list. '
            : `Confirmed with the Drug Service, ${REGISTER_VERIFIED}. `}
          Opening hours and Drug Service participation can change — call ahead
          to confirm.
        </Text>
      </section>
    </div>
  )
}
