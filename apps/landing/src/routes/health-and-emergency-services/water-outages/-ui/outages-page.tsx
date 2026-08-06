import {
  Button,
  Heading,
  Link,
  Select,
  ShowHide,
  StatusBanner,
  Text,
} from '@govtech-bb/react'
import { useState } from 'react'
import { locateParish } from '../-lib/geo'
import {
  freshnessLabel,
  isCurrentConcern,
  isPast,
  type Outage,
  OUTAGE_TYPE_LABEL,
  type OutageType,
} from '../-lib/outages'
import { findParish, PARISHES } from '../-lib/parishes'
import type { WaterOutagesData } from '../-lib/water-alerts'
import { SubscribeForm } from './subscribe-form'

export const TITLE = 'Check for water outages in your area'
export const DESCRIPTION =
  'See current Barbados Water Authority notices for your parish, and sign up for email alerts.'

const TYPE_BADGE: Record<OutageType, string> = {
  emergency: 'bg-red-100 text-black-00',
  planned: 'bg-teal-100 text-white-00',
  repair: 'bg-yellow-100 text-black-00',
  notice: 'bg-blue-10 text-blue-100',
}

export function WaterOutagesPage({ data }: { data: WaterOutagesData }) {
  const { outages, checkedAt, now, failed } = data

  const [selected, setSelected] = useState('')
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState(false)
  const [locatedParish, setLocatedParish] = useState<string | null>(null)
  const [locatedExact, setLocatedExact] = useState(false)

  // Honest "service unavailable" state — we never show made-up notices.
  if (failed) {
    return (
      <StatusBanner variant="service-issue">
        <Text as="p">
          <span className="font-bold">
            We can&apos;t reach the Barbados Water Authority right now.
          </span>{' '}
          To avoid showing out-of-date or made-up information, notices are paused
          for the moment. Please try again shortly, or check the{' '}
          <Link
            external
            href="https://barbadoswaterauthority.com/service-disruptions/"
            variant="secondary"
          >
            BWA website
          </Link>{' '}
          directly.
        </Text>
      </StatusBanner>
    )
  }

  const active = outages.filter((o) => !isPast(o, now))
  const past = outages.filter((o) => isPast(o, now))

  // Per-parish counts use ACTIVE notices only, so old ones don't light up an area.
  const counts: Record<string, number> = {}
  for (const o of active) {
    for (const parish of o.parishes) counts[parish] = (counts[parish] ?? 0) + 1
  }

  const visibleActive = selected
    ? active.filter((o) => o.parishes.includes(selected))
    : active.filter((o) => o.parishes.length > 0)
  const visiblePast = selected
    ? past.filter((o) => o.parishes.includes(selected))
    : past
  const general = active.filter((o) => o.parishes.length === 0)
  const selectedLabel = selected ? (findParish(selected)?.label ?? null) : null

  const showStoreWater =
    !!selected &&
    visibleActive.some((o) => o.type !== 'notice' && isCurrentConcern(o, now))

  const affected = PARISHES.filter((p) => counts[p.value])

  function chooseParish(value: string) {
    setSelected(value)
    setLocationError(false)
    setLocatedParish(null)
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationError(true)
      return
    }
    setLocating(true)
    setLocationError(false)
    setLocatedParish(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const located = await locateParish(
          pos.coords.latitude,
          pos.coords.longitude,
        )
        if (located) {
          setSelected(located.value)
          setLocatedParish(located.value)
          setLocatedExact(located.exact)
        } else {
          setLocationError(true)
        }
        setLocating(false)
      },
      () => {
        setLocationError(true)
        setLocating(false)
      },
      { timeout: 8000 },
    )
  }

  return (
    <div className="space-y-6">
      <Heading as="h1">{TITLE}</Heading>
      <Text as="p">
        Notices come straight from the Barbados Water Authority (BWA). Choose
        your parish to see what affects you, and get an email when a new notice
        appears near you.
      </Text>

      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Select
            label="Choose a parish"
            onChange={(e) => chooseParish(e.target.value)}
            value={selected}
          >
            <option value="">All of Barbados</option>
            {PARISHES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
                {counts[p.value] ? ` (${counts[p.value]})` : ''}
              </option>
            ))}
          </Select>
        </div>
        <Button disabled={locating} onClick={useMyLocation} variant="secondary">
          {locating ? 'Finding you…' : 'Use my location'}
        </Button>
      </div>

      <Text as="p" className="text-grey-100" size="caption">
        We use your location to find your parish. We do not store it.
      </Text>

      {locationError && (
        <StatusBanner variant="service-issue">
          <Text as="p">
            We could not use your location. Choose a parish instead.
          </Text>
        </StatusBanner>
      )}

      {locatedParish && selected === locatedParish && (
        <div className="rounded-md bg-blue-10 p-4">
          <Text as="p">
            {locatedExact ? (
              <>
                Based on your location, you&apos;re in{' '}
                <span className="font-bold">
                  {findParish(locatedParish)?.label}
                </span>
                . If that&apos;s not right, choose your parish above.
              </>
            ) : (
              <>
                We couldn&apos;t pin your exact parish, so we&apos;ve picked the
                closest one:{' '}
                <span className="font-bold">
                  {findParish(locatedParish)?.label}
                </span>
                . Please check it&apos;s right, or choose your parish above.
              </>
            )}
          </Text>
        </div>
      )}

      {/* Affected-parishes summary. TODO: an interactive parish map slots in
          here once a client-only map dependency is approved (see Step 5 note). */}
      {affected.length > 0 && (
        <div className="rounded-md border-2 border-grey-00 p-4">
          <Text as="p" className="font-semibold">
            Parishes with current notices
          </Text>
          <div className="mt-3 flex flex-wrap gap-2">
            {affected.map((p) => (
              <button
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  selected === p.value
                    ? 'bg-blue-100 text-white-00'
                    : 'bg-red-100 text-black-00'
                }`}
                key={p.value}
                onClick={() => chooseParish(p.value)}
                type="button"
              >
                {p.label} ({counts[p.value]})
              </button>
            ))}
          </div>
        </div>
      )}

      {showStoreWater && (
        <StatusBanner variant="service-issue">
          <Text as="p">
            Some parts of {selectedLabel} may have no water or low water
            pressure. You may need to store some water in case your water goes
            off.
          </Text>
        </StatusBanner>
      )}

      <SubscribeForm selectedArea={selected} selectedLabel={selectedLabel} />

      <Text as="p" className="text-grey-100" size="caption">
        Notices published by the Barbados Water Authority.
        {checkedAt ? ` Last checked: ${formatCheckedAt(checkedAt)}.` : ''}
      </Text>

      {/* List */}
      <div className="space-y-4">
        <Heading as="h2">
          {selectedLabel ? `Notices for ${selectedLabel}` : 'Current notices'}
        </Heading>

        {visibleActive.length === 0 ? (
          <div className="rounded-md bg-blue-10 p-6">
            <Text as="p">
              There are no current BWA notices
              {selectedLabel ? ` for ${selectedLabel}` : ''}.
              {general.length > 0
                ? ' See the general notices below, which may still affect you.'
                : ' If you have no water, the BWA may not have published a notice yet.'}
            </Text>
          </div>
        ) : (
          visibleActive.map((o) => <OutageCard key={o.id} now={now} outage={o} />)
        )}

        {general.length > 0 && (
          <>
            <Heading as="h3">General notices</Heading>
            <Text as="p" className="text-grey-100" size="caption">
              These affect areas the BWA did not tie to a single parish, so they
              may still apply to you.
            </Text>
            {general.map((o) => (
              <OutageCard key={o.id} now={now} outage={o} />
            ))}
          </>
        )}

        <div className="rounded-md bg-blue-10 p-4">
          <Text as="p">
            Water problem not listed here? A notice may not cover your exact
            area.{' '}
            <Link
              external
              href="https://barbadoswaterauthority.com/contact-us/"
              variant="secondary"
            >
              Report a water outage to the BWA
            </Link>{' '}
            (or call 246-434-4292).
          </Text>
        </div>

        {visiblePast.length > 0 && (
          <ShowHide summary={`Past notices (${visiblePast.length})`}>
            <div className="space-y-4 pt-2">
              <Text as="p" className="text-grey-100" size="caption">
                View notices that have ended.
              </Text>
              {visiblePast.map((o) => (
                <OutageCard key={o.id} now={now} outage={o} />
              ))}
            </div>
          </ShowHide>
        )}
      </div>
    </div>
  )
}

function OutageCard({ outage, now }: { outage: Outage; now: number }) {
  const fresh = freshnessLabel(outage, now)
  const over = fresh === 'Ended'

  return (
    <div
      className={`rounded-md border-2 border-grey-00 bg-white-00 p-5 shadow-sm ${
        over ? 'opacity-70' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-3 py-0.5 text-sm font-semibold ${TYPE_BADGE[outage.type]}`}
        >
          {OUTAGE_TYPE_LABEL[outage.type]}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-3 py-0.5 text-sm font-semibold ${
            over ? 'bg-blue-10 text-grey-100' : 'bg-green-10 text-green-100'
          }`}
        >
          {fresh}
        </span>
        <Text as="span" className="text-grey-100" size="caption">
          Posted {formatDate(outage.published)}
        </Text>
      </div>
      <Heading as="h3" className="mt-2">
        {outage.title}
      </Heading>
      {outage.summary && (
        <Text as="p" className="mt-2">
          {outage.summary}
        </Text>
      )}
      <div className="mt-3">
        <Link
          aria-label={`Read the BWA notice about ${outage.title}`}
          external
          href={outage.link}
          variant="secondary"
        >
          Read the BWA notice
        </Link>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function formatCheckedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Barbados',
    })
  } catch {
    return ''
  }
}
