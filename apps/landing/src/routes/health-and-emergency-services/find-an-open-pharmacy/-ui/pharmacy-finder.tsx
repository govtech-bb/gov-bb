/**
 * Pharmacy finder (interactive)
 * --------------------------------------------------------------
 * Orchestrates the finder: one reducer owns the filter facets
 * (-lib/finder-filters), the sidebar and no-results panel are their own
 * components, and matching/sorting are pure functions. Filter state is
 * mirrored to the URL so a filtered view can be shared.
 *
 * "Open now" is computed against the Barbados wall clock after mount only
 * (ticking each minute), so server and client markup stay identical.
 */

import { Button, Heading, Text } from '@govtech-bb/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { PHARMACIES } from '../-data/pharmacies'
import type { LatLon } from '../-data/pharmacies'
import type { FilterAction } from '../-lib/finder-filters'
import {
  compareForSort,
  DEFAULT_FILTERS,
  filtersFromParams,
  filtersReducer,
  matchesFilters,
  paramsFromFilters,
} from '../-lib/finder-filters'
import { pharmacyDistanceKm } from '../-lib/pharmacy-distance'
import { FilterSidebar } from './filter-sidebar'
import { NoResultsPanel } from './no-results-panel'
import { PharmacyCard } from './pharmacy-card'

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 300_000,
}

// Keyed by GeolocationPositionError.code - an arbitrary runtime number, so
// a Map lookup, not a literal-keyed object.
const LOCATION_ERRORS = new Map<number, string>([
  [
    1,
    'Location permission is blocked, so results are not sorted by distance. Allow location in your browser settings, or filter by parish instead.',
  ],
  [
    2,
    'We could not get your location, so results are not sorted by distance. Filter by parish instead.',
  ],
  [
    3,
    'The location request timed out. Try again, or filter by parish instead.',
  ],
])

type LocationState = 'idle' | 'loading' | 'success'

/** Pharmacies shown before the "Show more" button appears. */
const PAGE_SIZE = 12

export function PharmacyFinder() {
  const [filters, dispatchFilters] = useReducer(filtersReducer, DEFAULT_FILTERS)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const locationRequest = useRef(0)
  const mounted = useRef(false)
  const resultList = useRef<HTMLUListElement>(null)
  const nextResultToFocus = useRef<number | null>(null)

  const [userLocation, setUserLocation] = useState<LatLon | null>(null)
  const [locationState, setLocationState] = useState<LocationState>('idle')
  const [locationStatus, setLocationStatus] = useState<string | null>(null)

  // The current instant, set after mount only so the server render (no
  // status line) matches the hydration render exactly. Ticks each minute so
  // "Closes in N min" and open/closed stay honest in a parked tab.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    mounted.current = true
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => {
      clearInterval(timer)
      mounted.current = false
    }
  }, [])

  const requestLocation = useCallback(() => {
    const requestId = ++locationRequest.current
    if (!navigator.geolocation) {
      setLocationStatus(
        'Your browser cannot share your location. You can still filter by parish.',
      )
      return
    }
    setLocationState('loading')
    setLocationStatus('Finding your location…')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mounted.current || requestId !== locationRequest.current) return
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        })
        setLocationState('success')
        setLocationStatus(
          'Government pharmacies first. Within each group, open pharmacies come first, then those nearest to you.',
        )
      },
      (error) => {
        if (!mounted.current || requestId !== locationRequest.current) return
        setUserLocation(null)
        setLocationState('idle')
        setLocationStatus(
          LOCATION_ERRORS.get(error.code) ??
            'We could not get your location. Filter by parish instead.',
        )
      },
      GEO_OPTIONS,
    )
  }, [])

  const clearLocation = useCallback(() => {
    locationRequest.current++
    setUserLocation(null)
    setLocationState('idle')
    setLocationStatus(null)
  }, [])

  const dispatch = useCallback(
    (action: FilterAction) => {
      if (action.type === 'clear-all') clearLocation()
      nextResultToFocus.current = null
      dispatchFilters(action)
      setVisibleCount(PAGE_SIZE)
    },
    [clearLocation],
  )

  useEffect(() => {
    if (nextResultToFocus.current === null) return
    resultList.current
      ?.querySelectorAll<HTMLAnchorElement>('h3 a')
      [nextResultToFocus.current]?.focus()
    nextResultToFocus.current = null
  }, [visibleCount])

  // One URL sync effect: the first run (post-mount, so server and client
  // markup stay identical) reads shared `?parish=…` links INTO filter state;
  // every later run writes filter state back OUT to the URL so a filtered
  // view can be shared. Hydrating produces a fresh `filters` object, which
  // re-fires the effect with the ref already flipped.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true
      const params = new URLSearchParams(window.location.search)
      dispatchFilters({ type: 'hydrate', value: filtersFromParams(params) })
      if (params.get('near') === '1') requestLocation()
      return
    }
    const params = paramsFromFilters(filters)
    if (locationState === 'success') {
      params.set('near', '1')
    }
    const qs = params.toString()
    // Preserve the router's own history.state - nulling it makes TanStack
    // Router treat the URL change as a navigation and reset the scroll
    // position moments later.
    window.history.replaceState(
      window.history.state,
      '',
      qs ? `?${qs}` : window.location.pathname,
    )
  }, [filters, locationState, requestLocation])

  const results = useMemo(
    () =>
      PHARMACIES.filter((pharmacy) =>
        matchesFilters(pharmacy, filters, now),
      ).sort((a, b) => compareForSort(a, b, now, userLocation)),
    [filters, now, userLocation],
  )

  // The complete default directory remains usable without JavaScript.
  const visiblePharmacies =
    now === null ? results : results.slice(0, visibleCount)

  return (
    <section aria-label="Pharmacy finder">
      <div className="govbb-grid-row">
        <div className="govbb-grid-column-one-third-from-desktop">
          {now !== null && (
            <FilterSidebar
              dispatch={dispatch}
              filters={filters}
              locationState={locationState}
              locationStatus={locationStatus}
              onClearLocation={clearLocation}
              onRequestLocation={requestLocation}
            />
          )}
        </div>

        <div className="govbb-grid-column-two-thirds-from-desktop">
          <Heading as="h2" className="govbb-visually-hidden">
            Results
          </Heading>
          <noscript>
            <Text as="p">
              Call the pharmacies below to confirm opening times.
            </Text>
          </noscript>
          <>
            <Text
              as="p"
              className="mb-s"
              role="status"
              aria-atomic="true"
              weight="bold"
            >
              {resultCountLabel(visiblePharmacies.length, results.length)}
            </Text>
            {results.length === 0 ? (
              <NoResultsPanel dispatch={dispatch} filters={filters} now={now} />
            ) : (
              <>
                <ul
                  ref={resultList}
                  className="flex list-none flex-col gap-s p-0"
                >
                  {results.map((pharmacy, index) => (
                    <PharmacyCard
                      distanceKm={pharmacyDistanceKm(pharmacy, userLocation)}
                      key={pharmacy.slug}
                      now={now}
                      pharmacy={pharmacy}
                      printOnly={index >= visiblePharmacies.length}
                    />
                  ))}
                </ul>
                {visiblePharmacies.length < results.length && (
                  <div className="mt-m print:hidden">
                    <Button
                      className="w-full justify-center"
                      onClick={() => {
                        nextResultToFocus.current = visibleCount
                        setVisibleCount((count) => count + PAGE_SIZE)
                      }}
                      type="button"
                      variant="secondary"
                    >
                      Show{' '}
                      {Math.min(
                        PAGE_SIZE,
                        results.length - visiblePharmacies.length,
                      )}{' '}
                      more pharmacies
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        </div>
      </div>
    </section>
  )
}

function resultCountLabel(visible: number, matched: number): string {
  if (matched === 0) {
    return 'No pharmacies match your filters'
  }
  if (matched === 1) return 'Showing 1 pharmacy'
  if (visible >= matched) {
    return `Showing all ${matched} pharmacies`
  }
  return `Showing ${visible} of ${matched} pharmacies`
}
