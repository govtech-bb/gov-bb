import {
  Button,
  Heading,
  Link,
  Select,
  ShowHide,
  StatusBanner,
  Text,
} from '@govtech-bb/react'
import { ClientOnly } from '@tanstack/react-router'
import { lazy, Suspense, useRef, useState } from 'react'
import { locateParish } from '../-lib/geo'
import {
  freshnessLabel,
  isCurrentConcern,
  isPast,
  OUTAGE_TYPE_LABEL,
} from '../-lib/outages'
import type { Outage } from '../-lib/outages'
import { findParish, PARISHES } from '../-lib/parishes'
import type { WaterOutagesData } from '../-lib/water-alerts'
import { SubscribeForm } from './subscribe-form'

export const TITLE = 'Check for water outages in your area'
export const DESCRIPTION =
  'See current Barbados Water Authority notices for your parish, and sign up for email alerts.'

function MapUnavailable() {
  return (
    <Text as="p" className="water-outages-map-message">
      The map could not load. Choose a parish above to see its notices.
    </Text>
  )
}

const OutageMap = lazy(() =>
  import('./outage-map').catch(() => ({ default: MapUnavailable })),
)

const MAP_FALLBACK = (
  <Text as="p" className="water-outages-map-message">
    Loading the parish map… You can also choose a parish above.
  </Text>
)

export function WaterOutagesPage({ data }: { data: WaterOutagesData }) {
  const { outages, checkedAt, now, failed } = data

  const [selected, setSelected] = useState('')
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState(false)
  const [locatedParish, setLocatedParish] = useState<string | null>(null)
  const [locatedExact, setLocatedExact] = useState(false)
  const locationRequest = useRef(0)

  const heading = (
    <>
      <Heading as="h1">{TITLE}</Heading>
      <Text as="p">
        Notices come straight from the Barbados Water Authority (BWA). Choose
        your parish to see what affects you, and get an email when a new notice
        appears near you.
      </Text>
    </>
  )

  // Honest "service unavailable" state — we never show made-up notices.
  if (failed) {
    return (
      <div className="water-outages-page">
        {heading}
        <StatusBanner variant="service">
          <Text as="p">
            <strong>
              We can&apos;t reach the Barbados Water Authority right now.
            </strong>{' '}
            To avoid showing out-of-date or made-up information, notices are
            paused for the moment. Please try again shortly, or check the{' '}
            <Link
              external
              href="https://barbadoswaterauthority.com/service-disruptions/"
            >
              BWA website
            </Link>{' '}
            directly.
          </Text>
        </StatusBanner>
        <SubscribeForm selectedArea="" selectedLabel={null} />
      </div>
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

  function chooseParish(value: string) {
    locationRequest.current += 1
    setSelected(value)
    setLocating(false)
    setLocationError(false)
    setLocatedParish(null)
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationError(true)
      return
    }
    setLocating(true)
    setLocationError(false)
    setLocatedParish(null)
    const request = ++locationRequest.current
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const located = await locateParish(
            pos.coords.latitude,
            pos.coords.longitude,
          )
          if (request !== locationRequest.current) return
          if (located) {
            setSelected(located.value)
            setLocatedParish(located.value)
            setLocatedExact(located.exact)
          } else {
            setLocationError(true)
          }
        } catch {
          if (request === locationRequest.current) setLocationError(true)
        } finally {
          if (request === locationRequest.current) setLocating(false)
        }
      },
      () => {
        if (request !== locationRequest.current) return
        setLocationError(true)
        setLocating(false)
      },
      { timeout: 8000 },
    )
  }

  return (
    <div className="water-outages-page">
      {heading}

      {/* Controls */}
      <div className="water-outages-controls">
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
        <Button
          aria-busy={locating}
          disabled={locating}
          onClick={requestLocation}
          type="button"
          variant="secondary"
        >
          {locating ? 'Finding you…' : 'Use my location'}
        </Button>
      </div>

      <Text as="p" className="govbb-hint" size="body-sm">
        We use your location to find your parish. We do not store it.
      </Text>

      <div
        aria-live="polite"
        aria-atomic="true"
        className={
          locationError || locatedParish ? undefined : 'govbb-visually-hidden'
        }
      >
        {locationError && (
          <StatusBanner variant="service">
            <Text as="p">
              We could not find your parish in Barbados. Choose a parish
              instead.
            </Text>
          </StatusBanner>
        )}

        {locatedParish && selected === locatedParish && (
          <div className="govbb-status-banner govbb-status-banner--rounded water-outages-note">
            <Text as="p">
              {locatedExact ? (
                <>
                  Based on your location, you&apos;re in{' '}
                  <strong>{findParish(locatedParish)?.label}</strong>. If
                  that&apos;s not right, choose your parish above.
                </>
              ) : (
                <>
                  We couldn&apos;t pin your exact parish, so we&apos;ve picked
                  the closest one:{' '}
                  <strong>{findParish(locatedParish)?.label}</strong>. Please
                  check it&apos;s right, or choose your parish above.
                </>
              )}
            </Text>
          </div>
        )}
      </div>

      <figure className="water-outages-figure">
        <div
          className="water-outages-map"
          role="region"
          aria-label="Water notices by parish"
        >
          <ClientOnly fallback={MAP_FALLBACK}>
            <Suspense fallback={MAP_FALLBACK}>
              <OutageMap
                counts={counts}
                onSelect={chooseParish}
                selected={selected}
              />
            </Suspense>
          </ClientOnly>
        </div>
        <figcaption>
          <Text as="p" className="govbb-hint" size="body-sm">
            Select a circle or choose a parish above. Red circles have current
            notices; blue-grey circles have none. A dark blue border marks your
            choice. Circles show parish centres, not the exact areas affected.
          </Text>
        </figcaption>
      </figure>

      {showStoreWater && (
        <StatusBanner variant="service">
          <Text as="p">
            Some parts of {selectedLabel} may have no water or low water
            pressure. You may need to store some water in case your water goes
            off.
          </Text>
        </StatusBanner>
      )}

      <SubscribeForm selectedArea={selected} selectedLabel={selectedLabel} />

      <Text as="p" className="govbb-hint" size="body-sm">
        Notices published by the Barbados Water Authority.
        {checkedAt ? ` Last checked: ${formatCheckedAt(checkedAt)}.` : ''}
      </Text>

      {/* List */}
      <div className="water-outages-notices">
        <Heading as="h2">
          {selectedLabel ? `Notices for ${selectedLabel}` : 'Current notices'}
        </Heading>

        {visibleActive.length === 0 ? (
          <div className="govbb-status-banner govbb-status-banner--rounded water-outages-note">
            <Text as="p">
              There are no current BWA notices
              {selectedLabel ? ` for ${selectedLabel}` : ''}.
              {general.length > 0
                ? ' See the general notices below, which may still affect you.'
                : ' If you have no water, the BWA may not have published a notice yet.'}
            </Text>
          </div>
        ) : (
          visibleActive.map((o) => (
            <OutageCard key={o.id} now={now} outage={o} />
          ))
        )}

        {general.length > 0 && (
          <>
            <Heading as="h3">General notices</Heading>
            <Text as="p" className="govbb-hint" size="body-sm">
              These affect areas the BWA did not tie to a single parish, so they
              may still apply to you.
            </Text>
            {general.map((o) => (
              <OutageCard key={o.id} now={now} outage={o} />
            ))}
          </>
        )}

        <div className="govbb-status-banner govbb-status-banner--rounded water-outages-note">
          <Text as="p">
            Water problem not listed here? A notice may not cover your exact
            area.{' '}
            <Link
              external
              href="https://barbadoswaterauthority.com/contact-us/"
            >
              Report a water outage to the BWA
            </Link>{' '}
            (or call <Link href="tel:+12464344292">246-434-4292</Link>).
          </Text>
        </div>

        {visiblePast.length > 0 && (
          <ShowHide summary={`Past notices (${visiblePast.length})`}>
            <Text as="p" className="govbb-hint" size="body-sm">
              View notices that have ended.
            </Text>
            {visiblePast.map((o) => (
              <OutageCard key={o.id} now={now} outage={o} />
            ))}
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
    <article className="water-outages-card">
      <div className="water-outages-metadata">
        <Text
          as="span"
          className="water-outages-badge"
          data-type={outage.type}
          size="body-sm"
          weight="bold"
        >
          {OUTAGE_TYPE_LABEL[outage.type]}
        </Text>
        <Text
          as="span"
          className="water-outages-badge"
          data-state={over ? 'ended' : 'active'}
          size="body-sm"
          weight="bold"
        >
          {fresh}
        </Text>
        <Text as="span" className="govbb-hint" size="body-sm">
          Posted {formatDate(outage.published)}
        </Text>
      </div>
      <Heading as="h3">{outage.title}</Heading>
      {outage.summary && <Text as="p">{outage.summary}</Text>}
      <div>
        <Link
          aria-label={`Read the BWA notice about ${outage.title}`}
          external
          href={outage.link}
        >
          Read the BWA notice
        </Link>
      </div>
    </article>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Barbados',
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
