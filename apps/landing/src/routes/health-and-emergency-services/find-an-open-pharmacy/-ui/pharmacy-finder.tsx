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

import { Button, Text } from '@govtech-bb/react'
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
import { DRUG_SERVICE_PHONE } from '../-lib/routes'
import { FilterSidebar } from './filter-sidebar'
import { NoResultsPanel } from './no-results-panel'
import { PharmacyCard } from './pharmacy-card'

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 300_000,
}

// Keyed by GeolocationPositionError.code — an arbitrary runtime number, so
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

  // Every user-driven filter change returns to the first page — done here,
  // in the dispatch path, not as an effect reacting to state.
  const dispatch = useCallback((action: FilterAction) => {
    dispatchFilters(action)
    setVisibleCount(PAGE_SIZE)
  }, [])

  const [userLocation, setUserLocation] = useState<LatLon | null>(null)
  const [locationState, setLocationState] = useState<LocationState>('idle')
  const [locationStatus, setLocationStatus] = useState<string | null>(null)

  // The current instant, set after mount only so the server render (no
  // status line) matches the hydration render exactly. Ticks each minute so
  // "Closes in N min" and open/closed stay honest in a parked tab.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const requestLocation = useCallback(() => {
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
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        })
        setLocationState('success')
        setLocationStatus('Open pharmacies first, then nearest to you.')
      },
      (error) => {
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
    setUserLocation(null)
    setLocationState('idle')
    setLocationStatus(null)
  }, [])

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
    // Preserve the router's own history.state — nulling it makes TanStack
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

  const visiblePharmacies = results.slice(0, visibleCount)

  // "Open right now" can only assess pharmacies with confirmed hours — say
  // how many it is silently leaving out rather than hiding them wordlessly.
  const hiddenUnconfirmedHours = useMemo(() => {
    if (!filters.openNow || !now) return 0
    return PHARMACIES.filter(
      (pharmacy) =>
        !pharmacy.hours &&
        matchesFilters(pharmacy, { ...filters, openNow: false }, now),
    ).length
  }, [filters, now])

  return (
    <section aria-label="Pharmacy finder">
      <Text
        as="p"
        className="mb-s text-mid-grey-00 print:hidden"
        size="caption"
      >
        <button
          className="underline"
          onClick={() => window.print()}
          type="button"
        >
          Print this list
        </button>{' '}
        to keep a paper copy by the phone. Each pharmacy has a Google Maps
        directions link.
      </Text>

      <div className="lg:grid lg:grid-cols-[20rem_1fr] lg:gap-8">
        <FilterSidebar
          dispatch={dispatch}
          filters={filters}
          locationState={locationState}
          locationStatus={locationStatus}
          onClearLocation={clearLocation}
          onRequestLocation={requestLocation}
        />

        <div>
          <h2 className="sr-only">Results</h2>
          {now === null ? (
            <LoadingResults />
          ) : (
            <>
              <Text as="p" className="mb-xxs font-bold" role="status">
                {resultCountLabel(visiblePharmacies.length, results.length)}
              </Text>
              <Text as="p" className="mb-s text-mid-grey-00" size="caption">
                {filters.subsidisedOnly ? (
                  <>
                    Showing pharmacies that give free or cheaper medication.{' '}
                    <button
                      className="underline"
                      onClick={() =>
                        dispatch({
                          type: 'set-subsidised-only',
                          value: false,
                        })
                      }
                      type="button"
                    >
                      Show all pharmacies
                    </button>
                    .
                  </>
                ) : (
                  <>
                    Showing all pharmacies, including those not confirmed in
                    the subsidy.{' '}
                    <button
                      className="underline"
                      onClick={() =>
                        dispatch({ type: 'set-subsidised-only', value: true })
                      }
                      type="button"
                    >
                      Show only free and subsidised
                    </button>
                    .
                  </>
                )}{' '}
                Open/closed status is shown in Barbados time.
                {hiddenUnconfirmedHours > 0 &&
                  ` ${hiddenUnconfirmedHours} ${
                    hiddenUnconfirmedHours === 1 ? 'pharmacy' : 'pharmacies'
                  } with unconfirmed hours ${
                    hiddenUnconfirmedHours === 1 ? 'is' : 'are'
                  } hidden — call to check.`}
              </Text>

              {results.length === 0 ? (
                <NoResultsPanel dispatch={dispatch} filters={filters} now={now} />
              ) : (
                <>
                  <ul className="flex list-none flex-col gap-s p-0">
                    {visiblePharmacies.map((pharmacy) => (
                      <PharmacyCard
                        distanceKm={pharmacyDistanceKm(pharmacy, userLocation)}
                        key={pharmacy.name}
                        now={now}
                        pharmacy={pharmacy}
                      />
                    ))}
                    {/* "Print this list" prints every match, not just the visible page. */}
                    {results.slice(visibleCount).map((pharmacy) => (
                      <PharmacyCard
                        distanceKm={pharmacyDistanceKm(pharmacy, userLocation)}
                        key={pharmacy.name}
                        now={now}
                        pharmacy={pharmacy}
                        printOnly
                      />
                    ))}
                  </ul>
                  {visiblePharmacies.length < results.length && (
                    <div className="mt-m print:hidden">
                      <Button
                        className="w-full justify-center"
                        onClick={() =>
                          setVisibleCount((count) => count + PAGE_SIZE)
                        }
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
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * Loader for the results column while the Barbados clock is unknown
 * (server render and the instant before hydration) — the list then arrives
 * once, sorted and with statuses, instead of popping in piecemeal.
 */
function LoadingResults() {
  return (
    <div className="flex flex-col items-center gap-s py-l" role="status">
      <span
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-4 border-grey-00 border-t-green-00 motion-reduce:animate-none"
      />
      <Text as="p" className="text-mid-grey-00">
        Loading pharmacies…
      </Text>
      <noscript>
        <Text as="p">
          This page needs JavaScript to list pharmacies. To find a pharmacy or
          ask about free or subsidised medication, call the Drug Service on{' '}
          {DRUG_SERVICE_PHONE}.
        </Text>
      </noscript>
    </div>
  )
}

function resultCountLabel(visible: number, matched: number): string {
  if (matched === 0) {
    return 'No pharmacies match your filters'
  }
  if (visible >= matched) {
    return `Showing all ${matched} pharmacies`
  }
  return `Showing ${visible} of ${matched} pharmacies`
}
