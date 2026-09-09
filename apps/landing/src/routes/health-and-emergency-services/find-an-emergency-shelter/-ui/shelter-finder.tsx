/**
 * Emergency shelter finder (interactive)
 * --------------------------------------------------------------
 * Search 70 shelters by name; filter by parish, category and amenities using
 * the GOV.BB Filter pattern (collapsible panel of accordion checkbox groups
 * with removable filter tags); sort by parish, name, capacity or distance.
 * "Use my location" enables nearest-first ordering. Filter state is mirrored
 * to the URL so a filtered view can be shared.
 *
 * No live activation feed exists, so every shelter shows "Not currently open".
 */

import {
  Button,
  Checkbox,
  Heading,
  Input,
  Link,
  Select,
  Text,
} from '@govtech-bb/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  getDemPhone,
  PARISHES,
  SHELTER_CONTENT,
} from '../-data/emergency-shelters'
import type {
  LatLon,
  Shelter,
  ShelterContent,
  ShelterCopy,
} from '../-data/emergency-shelters'
import { formatCopy } from '../-lib/copy'
import { shelterDistance, userIsOnIsland } from '../-lib/shelter-distance'
import { Chevron, CloseIcon, LocationIcon } from './icons'
import { ShelterCard } from './shelter-card'

type SortKey = 'parish' | 'name' | 'capacity' | 'distance'
type LocationState = 'idle' | 'loading' | 'success'

interface Filters {
  parishes: string[]
  categories: string[]
  accessible: boolean
  search: string
}

function parseList(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : []
}

const SORT_KEYS: readonly SortKey[] = ['parish', 'name', 'capacity', 'distance']

function parseSort(value: string | null): SortKey {
  return value && (SORT_KEYS as readonly string[]).includes(value)
    ? (value as SortKey)
    : 'parish'
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value]
}

function matchesFilters(shelter: Shelter, f: Filters): boolean {
  if (f.parishes.length > 0 && !f.parishes.includes(shelter.parish)) {
    return false
  }
  if (
    f.categories.length > 0 &&
    !f.categories.includes(String(shelter.category))
  ) {
    return false
  }
  if (f.accessible && !shelter.access) {
    return false
  }
  const query = f.search.trim().toLowerCase()
  if (
    query &&
    !(
      shelter.name.toLowerCase().includes(query) ||
      shelter.parish.toLowerCase().includes(query)
    )
  ) {
    return false
  }
  return true
}

function compareForSort(
  a: Shelter,
  b: Shelter,
  sort: SortKey,
  user: LatLon | null,
): number {
  if (sort === 'name') {
    return a.name.localeCompare(b.name)
  }
  if (sort === 'capacity') {
    return b.capacity - a.capacity
  }
  if (sort === 'distance' && user) {
    const da = shelterDistance(a, user)
    const db = shelterDistance(b, user)
    if (da === null) {
      return 1
    }
    if (db === null) {
      return -1
    }
    return da.km - db.km
  }
  return a.parish === b.parish
    ? a.name.localeCompare(b.name)
    : a.parish.localeCompare(b.parish)
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 60_000,
}

const LOCATION_ERRORS: Record<number, keyof ShelterCopy['location']> = {
  1: 'permissionDenied',
  2: 'unavailable',
  3: 'timedOut',
}

/** Shelters shown before the "Show more" button appears. */
const PAGE_SIZE = 12

export function ShelterFinder({
  content = SHELTER_CONTENT,
}: { content?: ShelterContent } = {}) {
  const { finder: copy, common, location } = content.copy
  const dem = getDemPhone(content)
  const accessibleCount = content.shelters.filter(
    (shelter) => shelter.access,
  ).length
  const [parishes, setParishes] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [accessible, setAccessible] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('parish')

  const [userLocation, setUserLocation] = useState<LatLon | null>(null)
  const [locationStatus, setLocationStatus] = useState<
    keyof ShelterCopy['location'] | null
  >(null)
  const [locationState, setLocationState] = useState<LocationState>('idle')
  const [filterOpen, setFilterOpen] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Hydrate filters from the URL after mount. Reading window here (not in a
  // useState initialiser) keeps server and client markup identical and lets a
  // shared `?parish=…` link restore its view. `ready` gates the URL-mirroring
  // effect so it never clobbers the shared params with defaults before this
  // runs.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setParishes(parseList(params.get('parish')))
    setCategories(parseList(params.get('cat')))
    setAccessible(params.get('access') === '1')
    setSearch(params.get('q') ?? '')
    setSort(parseSort(params.get('sort')))
    setReady(true)
  }, [])

  // Reset to the first page whenever the filters or search change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on filter changes only
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [parishes, categories, accessible, search])

  // Mirror filters to the URL so a filtered view can be shared.
  useEffect(() => {
    if (!ready) return
    const params = new URLSearchParams()
    if (search) {
      params.set('q', search)
    }
    if (parishes.length > 0) {
      params.set('parish', parishes.join(','))
    }
    if (categories.length > 0) {
      params.set('cat', categories.join(','))
    }
    if (accessible) {
      params.set('access', '1')
    }
    if (sort !== 'parish') {
      params.set('sort', sort)
    }
    const qs = params.toString()
    window.history.replaceState(
      null,
      '',
      qs ? `?${qs}` : window.location.pathname,
    )
  }, [ready, search, parishes, categories, accessible, sort])

  const results = useMemo(() => {
    const active: Filters = { parishes, categories, accessible, search }
    return content.shelters
      .filter((shelter) => matchesFilters(shelter, active))
      .sort((a, b) => compareForSort(a, b, sort, userLocation))
  }, [
    content.shelters,
    parishes,
    categories,
    accessible,
    search,
    sort,
    userLocation,
  ])

  const visibleShelters = results.slice(0, visibleCount)

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported')
      setSort('parish')
      return
    }
    setLocationStatus('loading')
    setLocationState('loading')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const found: LatLon = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        }
        if (!userIsOnIsland(found)) {
          setUserLocation(null)
          setLocationState('idle')
          setSort('parish')
          setLocationStatus('outsideBarbados')
          return
        }
        setUserLocation(found)
        setLocationState('success')
        setSort('distance')
        setLocationStatus('success')
      },
      (error) => {
        setUserLocation(null)
        setLocationState('idle')
        setSort('parish')
        setLocationStatus(LOCATION_ERRORS[error.code] ?? 'failed')
      },
      GEO_OPTIONS,
    )
  }, [])

  const onSortChange = useCallback(
    (value: SortKey) => {
      setSort(value)
      if (value === 'distance' && !userLocation) {
        requestLocation()
      }
    },
    [userLocation, requestLocation],
  )

  const clearAll = useCallback(() => {
    setParishes([])
    setCategories([])
    setAccessible(false)
    setSearch('')
  }, [])

  const tags: { key: string; label: string; remove: () => void }[] = [
    ...parishes.map((p) => ({
      key: `parish:${p}`,
      label: p,
      remove: () => setParishes((list) => list.filter((x) => x !== p)),
    })),
    ...categories.map((c) => ({
      key: `cat:${c}`,
      label: formatCopy(common.categoryLabel, { category: c }),
      remove: () => setCategories((list) => list.filter((x) => x !== c)),
    })),
    ...(accessible
      ? [
          {
            key: 'access',
            label: common.accessibleBathroom,
            remove: () => setAccessible(false),
          },
        ]
      : []),
  ]

  const locationLabel =
    locationState === 'loading'
      ? location.loading
      : locationState === 'success'
        ? location.refresh
        : location.use

  return (
    <section aria-label={copy.label}>
      <Text as="p" className="mb-s text-grey-70 print:hidden" size="body-sm">
        <button
          className="underline"
          onClick={() => window.print()}
          type="button"
        >
          {copy.printLabel}
        </button>{' '}
        {copy.printHint}
      </Text>

      <div className="lg:grid lg:grid-cols-[20rem_1fr] lg:gap-8">
        {/* Sidebar: search, locate and filter */}
        <div className="mb-m flex flex-col gap-m lg:mb-0 print:hidden">
          {/* Filter — GOV.BB pattern: collapsible panel of checkbox groups */}
          <div>
            <button
              aria-controls="shelter-filter-panel"
              aria-expanded={filterOpen}
              className="flex w-full items-center gap-xs border-grey-70 border-b py-3 text-green-80"
              onClick={() => setFilterOpen((open) => !open)}
              type="button"
            >
              <span className="font-bold text-body underline">
                {copy.filterLabel}
              </span>
              <Chevron open={filterOpen} />
            </button>

            {filterOpen && (
              <div
                className="flex flex-col gap-xm border-grey-20 border-b bg-grey-20 p-xm"
                id="shelter-filter-panel"
              >
                <Input
                  autoComplete="off"
                  label={copy.searchLabel}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  type="search"
                  value={search}
                />

                <div className="flex flex-col gap-xs">
                  <Button
                    aria-busy={locationState === 'loading'}
                    className="self-start"
                    disabled={locationState === 'loading'}
                    onClick={requestLocation}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2">
                      <LocationIcon />
                      {locationLabel}
                    </span>
                  </Button>
                  {locationStatus && (
                    <Text
                      aria-live="polite"
                      as="p"
                      className="text-grey-70"
                      size="body-sm"
                    >
                      {location[locationStatus]}
                    </Text>
                  )}
                </div>

                <Select
                  label={copy.sortLabel}
                  onChange={(event) =>
                    onSortChange(event.target.value as SortKey)
                  }
                  value={sort}
                >
                  <option value="parish">{copy.sortParish}</option>
                  <option value="name">{copy.sortName}</option>
                  <option value="capacity">{copy.sortCapacity}</option>
                  <option value="distance">{copy.sortDistance}</option>
                </Select>

                <FilterGroup defaultOpen={false} title={copy.parishHeading}>
                  {PARISHES.map((name) => (
                    <Checkbox
                      checked={parishes.includes(name)}
                      id={`parish-${name}`}
                      key={name}
                      label={name}
                      onChange={() =>
                        setParishes((list) => toggleValue(list, name))
                      }
                    />
                  ))}
                </FilterGroup>

                <FilterGroup
                  hint={copy.categoryHint}
                  title={copy.categoryHeading}
                >
                  <Checkbox
                    checked={categories.includes('1')}
                    id="cat-1"
                    label={formatCopy(common.categoryLabel, { category: 1 })}
                    onChange={() =>
                      setCategories((list) => toggleValue(list, '1'))
                    }
                  />
                  <Checkbox
                    checked={categories.includes('2')}
                    id="cat-2"
                    label={formatCopy(common.categoryLabel, { category: 2 })}
                    onChange={() =>
                      setCategories((list) => toggleValue(list, '2'))
                    }
                  />
                </FilterGroup>

                <FilterGroup
                  hint={formatCopy(copy.accessibilityHint, {
                    count: accessibleCount,
                  })}
                  title={copy.accessibilityHeading}
                >
                  <Checkbox
                    checked={accessible}
                    id="filter-access"
                    label={copy.accessibleLabel}
                    onChange={(event) =>
                      setAccessible(event.currentTarget.checked)
                    }
                  />
                </FilterGroup>
              </div>
            )}

            {tags.length > 0 && (
              <div className="flex flex-col gap-s pt-xs">
                <div className="flex flex-wrap items-center gap-xs">
                  {tags.map((tag) => (
                    <button
                      className="inline-flex items-center gap-2 bg-teal-10 p-2.5 font-medium hover:bg-teal-20"
                      key={tag.key}
                      onClick={tag.remove}
                      type="button"
                    >
                      {tag.label}
                      <CloseIcon />
                      <span className="sr-only">{copy.removeFilterLabel}</span>
                    </button>
                  ))}
                </div>
                <button
                  className="self-start font-semibold text-red-80 underline"
                  onClick={clearAll}
                  type="button"
                >
                  {copy.clearAllLabel}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Results — single column on mobile, grid on desktop */}
        <div>
          <Text as="p" className="mb-s font-bold" role="status">
            {resultCountLabel(visibleShelters.length, results.length, copy)}
          </Text>

          {results.length === 0 ? (
            <div className="border-blue-40 border-l-4 bg-blue-10 px-s py-xm">
              <Text as="p">
                {copy.emptyIntroduction}
                {dem && (
                  <>
                    {' '}
                    {common.phoneConnector}{' '}
                    <Link href={dem.tel}>{dem.display}</Link>
                  </>
                )}{' '}
                {copy.emptySuffix}
              </Text>
            </div>
          ) : (
            <>
              <ul className="grid list-none auto-rows-fr grid-cols-1 gap-s p-0 lg:grid-cols-2">
                {visibleShelters.map((shelter) => (
                  <ShelterCard
                    content={content}
                    distance={shelterDistance(shelter, userLocation)}
                    key={shelter.id}
                    shelter={shelter}
                  />
                ))}
              </ul>
              {visibleShelters.length < results.length && (
                <div className="mt-m flex justify-center print:hidden">
                  <Button
                    onClick={() =>
                      setVisibleCount((count) => count + PAGE_SIZE)
                    }
                    type="button"
                    variant="secondary"
                  >
                    {formatCopy(copy.showMore, {
                      count: Math.min(
                        PAGE_SIZE,
                        results.length - visibleShelters.length,
                      ),
                    })}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function FilterGroup({
  title,
  hint,
  defaultOpen = true,
  children,
}: {
  title: string
  hint?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="flex w-full flex-col gap-s border-grey-70 border-b pb-s">
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2.5"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Heading as="h3" size="h4">
          {title}
        </Heading>
        <span className="text-teal-80">
          <Chevron open={open} />
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-s">
          {hint && (
            <Text as="p" className="text-grey-70" size="body-sm">
              {hint}
            </Text>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

function resultCountLabel(
  visible: number,
  matched: number,
  copy: ShelterCopy['finder'],
): string {
  if (matched === 0) {
    return copy.noMatches
  }
  if (visible >= matched) {
    return formatCopy(copy.allMatches, { count: matched })
  }
  return formatCopy(copy.pagedMatches, { visible, count: matched })
}
