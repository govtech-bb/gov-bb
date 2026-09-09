/**
 * Pharmacy detail page - the canonical, shareable page for one pharmacy.
 * --------------------------------------------------------------
 * Body for /health-and-emergency-services/find-an-open-pharmacy/<slug>.
 * Single column in the house shape (max-w-2xl, 56→40→20/16px register),
 * like every sibling content surface: identity → actions → hours → guidance →
 * contact and provenance. Everything except the status line is static and
 * server-rendered, so a shared link is fully useful without JavaScript.
 */

import { Heading, Link, LinkButton, Text } from '@govtech-bb/react'
import { format, parseISO } from 'date-fns'
import { useEffect, useState } from 'react'
import type { Pharmacy, PharmacyContent } from '../-data/pharmacies'
import { PHARMACY_CONTENT } from '../-data/pharmacies'
import { formatCopy } from '../-lib/copy'
import { barbadosWallClock, isBankHoliday } from '../-lib/opening-hours'
import { mapsUrl, telHref, whatsappHref } from '../-lib/routes'
import { Caveat } from './caveat'
import { MapPinIcon } from './icons'
import { SlipsAccepted } from './slips-accepted'
import { CostChip, StatusLine, StatusSkeleton } from './status-pill'
import { WeeklyHoursRows } from './weekly-hours'

export function PharmacyDetailPage({
  pharmacy,
  content = PHARMACY_CONTENT,
}: {
  pharmacy: Pharmacy
  content?: PharmacyContent
}) {
  const { detail, drugService, page } = content.copy
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
  const whatsapp = whatsappHref(pharmacy, detail.whatsappMessage)

  return (
    <div className="mb-l flex max-w-2xl flex-col gap-m">
      <div className="flex flex-col gap-xs">
        <Heading as="h1">{pharmacy.name}</Heading>
        <div className="border-blue-10 border-b-4 pb-4 text-grey-70">
          <Text as="p" size="body-sm">
            {formatCopy(page.lastUpdated, {
              date: format(parseISO(content.lastUpdated), 'PPP'),
            })}
          </Text>
        </div>
        <div className="min-h-5">
          {now ? (
            <StatusLine now={now} pharmacy={pharmacy} content={content} />
          ) : (
            <StatusSkeleton />
          )}
        </div>
        <CostChip pharmacy={pharmacy} content={content} />
        <Text as="p" className="inline-flex items-baseline gap-2">
          <MapPinIcon />
          {pharmacy.address}
        </Text>
      </div>

      {pharmacy.pppStatus === 'not-participating' && (
        <Caveat>{detail.nonParticipatingWarning}</Caveat>
      )}
      {pharmacy.pppStatus === 'unconfirmed' && (
        <Caveat tone="confidence">{detail.unconfirmedWarning}</Caveat>
      )}

      <div className="flex flex-wrap items-center gap-s">
        {hasPlace && (
          <LinkButton external href={mapsUrl(pharmacy)}>
            {detail.directionsLabel}
          </LinkButton>
        )}
        {pharmacy.phone && (
          <LinkButton href={telHref(pharmacy.phone)} variant="secondary">
            {formatCopy(detail.callLabel, { phone: pharmacy.phone })}
          </LinkButton>
        )}
      </div>
      {!pharmacy.phone && (
        <Text as="p">
          {detail.noPhone}{' '}
          <Link href={telHref(drugService.phone)}>{drugService.phone}</Link>.
        </Text>
      )}

      <section aria-labelledby="opening-times" className="flex flex-col gap-s">
        <Heading as="h2" id="opening-times">
          {detail.openingHeading}
        </Heading>
        {pharmacy.hours ? (
          <WeeklyHoursRows
            content={content}
            hours={pharmacy.hours}
            today={today}
            todayIsHoliday={now ? isBankHoliday(now) : false}
            bankHolidayHours={pharmacy.bankHolidayHours}
          />
        ) : (
          <Caveat tone="confidence">{detail.unknownHours}</Caveat>
        )}
        {pharmacy.notes && <Caveat tone="confidence">{pharmacy.notes}</Caveat>}
        <div className="border-blue-40 border-l-4 bg-blue-10 px-s py-xm">
          <Text as="p">
            <strong>{detail.holidayLabel}</strong> {detail.holidayWarning}
          </Text>
        </div>
      </section>

      <SlipsAccepted pharmacy={pharmacy} content={content} />

      <Caveat>
        <strong>{detail.refusedLabel}</strong> {detail.refusedDescription}{' '}
        <Link href={telHref(drugService.phone)}>{drugService.phone}</Link>.
      </Caveat>

      <section
        aria-labelledby="contact-and-help"
        className="flex flex-col gap-s"
      >
        <Heading as="h2" id="contact-and-help">
          {detail.contactHeading}
        </Heading>
        {pharmacy.phone && (
          <Text as="p">
            {detail.telephoneLabel}{' '}
            <Link href={telHref(pharmacy.phone)}>{pharmacy.phone}</Link>
          </Text>
        )}
        {pharmacy.phoneExtension && (
          <Text as="p">
            {formatCopy(detail.extensionMessage, {
              extension: pharmacy.phoneExtension,
            })}
          </Text>
        )}
        {pharmacy.additionalPhones?.map((phone) => (
          <Text as="p" key={phone}>
            {detail.alternativeTelephoneLabel}{' '}
            <Link href={telHref(phone)}>{phone}</Link>
          </Text>
        ))}
        {whatsapp && (
          <Caveat tone="channel">
            <Link external href={whatsapp}>
              {detail.whatsappLabel}
            </Link>
          </Caveat>
        )}
        <Text as="p" className="text-grey-70" size="body-sm">
          {detail.callAhead}
        </Text>
      </section>
    </div>
  )
}
