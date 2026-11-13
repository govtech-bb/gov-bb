import {
  Button,
  ButtonGroup,
  Heading,
  Link,
  Select,
  ShowHide,
  StatusBanner,
  Text,
} from '@govtech-bb/react'
import { ClientOnly } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { trackEvent } from '@/lib/analytics'
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
  // Once per view: the ref survives StrictMode's second effect run.
  const tracked = useRef(false)
  useEffect(() => {
    if (tracked.current) return
    tracked.current = true
    trackEvent('tool-error', { tool: 'water-outages', error: 'map-failed' })
  }, [])

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

export function WaterOutagesPage({
  data,
  selected,
  onSelect,
  onRetry,
  retrying,
}: {
  data: WaterOutagesData
  selected: string
  onSelect: (parish: string) => void
  onRetry: () => void
  retrying: boolean
}) {
  const { outages, checkedAt, now, failed } = data

  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState(false)
  const [locatedParish, setLocatedParish] = useState<string | null>(null)
  const [locatedExact, setLocatedExact] = useState(false)
  const locationRequest = useRef(0)
  const parishTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pendingParish = useRef('')
  useEffect(() => () => clearTimeout(parishTimer.current), [])
  // Back or Forward to another parish cancels a choice still waiting.
  useEffect(() => {
    if (selected !== pendingParish.current) clearTimeout(parishTimer.current)
  }, [selected])

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
        <StatusBanner className="water-outages-result" variant="service">
          <Text as="p">
            <strong>
              We can&apos;t reach the Barbados Water Authority right now.
            </strong>{' '}
            Try again, or check the{' '}
            <Link
              external
              href="https://barbadoswaterauthority.com/service-disruptions/"
            >
              BWA website
            </Link>{' '}
            directly.
          </Text>
          <ButtonGroup>
            <Button
              aria-busy={retrying}
              disabled={retrying}
              onClick={onRetry}
              type="button"
              variant="secondary"
            >
              {retrying ? 'Trying again…' : 'Try again'}
            </Button>
          </ButtonGroup>
        </StatusBanner>
        <SubscribeForm
          selectedArea={selected}
          selectedLabel={findParish(selected)?.label ?? null}
        />
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

  // Sent once a choice has held for a second, as arrow keys on the list change
  // the parish at each press. "All of Barbados" is not a parish: it sends
  // nothing and cancels a choice still waiting.
  function trackParish(parish: string, chosenBy: 'list' | 'map' | 'location') {
    clearTimeout(parishTimer.current)
    if (!parish) return
    pendingParish.current = parish
    parishTimer.current = setTimeout(() => {
      trackEvent('tool-result', {
        tool: 'water-outages',
        outcome: 'parish-chosen',
        parish,
        chosen_by: chosenBy,
        active_notices: counts[parish] ?? 0,
        past_notices: past.filter((o) => o.parishes.includes(parish)).length,
      })
    }, 1000)
  }

  function chooseParish(value: string, chosenBy: 'list' | 'map') {
    locationRequest.current += 1
    onSelect(value)
    // The parish already shown, picked again on the map, is not a new result.
    if (value !== selected) trackParish(value, chosenBy)
    setLocating(false)
    setLocationError(false)
    setLocatedParish(null)
  }

  // Never the position itself: only that the lookup failed, and why.
  function locationFailed(error: 'location-denied' | 'location-unavailable') {
    setLocationError(true)
    trackEvent('tool-error', { tool: 'water-outages', error })
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      locationFailed('location-unavailable')
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
            onSelect(located.value)
            trackParish(located.value, 'location')
            setLocatedParish(located.value)
            setLocatedExact(located.exact)
          } else {
            locationFailed('location-unavailable')
          }
        } catch {
          if (request === locationRequest.current) {
            locationFailed('location-unavailable')
          }
        } finally {
          if (request === locationRequest.current) setLocating(false)
        }
      },
      (error) => {
        if (request !== locationRequest.current) return
        locationFailed(
          error.code === error.PERMISSION_DENIED
            ? 'location-denied'
            : 'location-unavailable',
        )
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
          onChange={(e) => chooseParish(e.target.value, 'list')}
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

      {showStoreWater && (
        <StatusBanner variant="service">
          <Text as="p">
            Some parts of {selectedLabel} may have no water or low water
            pressure. You may need to store some water in case your water goes
            off.
          </Text>
        </StatusBanner>
      )}

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
            (or call{' '}
            <Link
              href="tel:+12464344292"
              onClick={() =>
                trackEvent('tool-action', {
                  tool: 'water-outages',
                  action: 'call',
                })
              }
            >
              246-434-4292
            </Link>
            ).
          </Text>
        </div>

        {visiblePast.length > 0 && (
          <ShowHide summary={`Older notices (${visiblePast.length})`}>
            <Text as="p" className="govbb-hint" size="body-sm">
              These notices have passed their stated date or time, or were
              published more than three days ago without one. This does not
              confirm that water service has been restored.
            </Text>
            {visiblePast.map((o) => (
              <OutageCard key={o.id} now={now} outage={o} />
            ))}
          </ShowHide>
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
                onSelect={(value) => chooseParish(value, 'map')}
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

      <SubscribeForm selectedArea={selected} selectedLabel={selectedLabel} />
    </div>
  )
}

function OutageCard({ outage, now }: { outage: Outage; now: number }) {
  const fresh = freshnessLabel(outage, now)

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
          onClick={() =>
            trackEvent('tool-action', {
              tool: 'water-outages',
              action: 'open-notice',
            })
          }
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
