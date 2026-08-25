/**
 * Finder sidebar: locate button, search, filter accordion groups and the
 * removable filter tags. Presentational over the finder's filter state —
 * every change goes through the dispatched actions.
 */

import { Button, Checkbox, Heading, Input, Select, Text } from '@govtech-bb/react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { PARISHES } from '../-data/pharmacies'
import type { FilterAction, FilterState } from '../-lib/finder-filters'
import { Chevron, CloseIcon, LocationIcon } from './icons'

type LocationState = 'idle' | 'loading' | 'success'

export function FilterSidebar({
  filters,
  dispatch,
  locationState,
  locationStatus,
  onRequestLocation,
  onClearLocation,
}: {
  filters: FilterState
  dispatch: (action: FilterAction) => void
  locationState: LocationState
  locationStatus: string | null
  onRequestLocation: () => void
  onClearLocation: () => void
}) {
  // Open by default on desktop, where the panel sits beside the results —
  // but on small screens it stacks above them, so it starts closed to keep
  // the first pharmacy within reach.
  const [filterOpen, setFilterOpen] = useState(true)
  useEffect(() => {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setFilterOpen(false)
    }
  }, [])

  const tags: { key: string; label: string; action: FilterAction }[] = [
    ...filters.parishes.map((parish) => ({
      key: `parish:${parish}`,
      label: parish,
      action: { type: 'toggle-parish' as const, parish },
    })),
    ...(filters.type !== 'all'
      ? [
          {
            key: 'type',
            label:
              filters.type === 'government'
                ? 'Government'
                : 'Private (takes subsidy)',
            action: { type: 'set-type', value: 'all' } as FilterAction,
          },
        ]
      : []),
    ...(filters.slip !== 'any'
      ? [
          {
            key: 'slip',
            label: `${filters.slip.charAt(0).toUpperCase()}${filters.slip.slice(1)} slip`,
            action: { type: 'set-slip', value: 'any' } as FilterAction,
          },
        ]
      : []),
    ...(filters.openNow
      ? [
          {
            key: 'open',
            label: 'Open right now',
            action: { type: 'set-open-now', value: false } as FilterAction,
          },
        ]
      : []),
  ]

  const locationLabel =
    locationState === 'loading'
      ? 'Finding your location…'
      : locationState === 'success'
        ? 'Sorted by distance (turn off)'
        : 'Use my location'

  return (
    <div className="mb-m flex flex-col gap-m lg:mb-0 print:hidden">
      <h2 className="sr-only">Filter pharmacies</h2>
      <div>
        <button
          aria-controls="pharmacy-filter-panel"
          aria-expanded={filterOpen}
          className="flex w-full items-center gap-xs border-mid-grey-00 border-b py-3 text-green-00"
          onClick={() => setFilterOpen((open) => !open)}
          type="button"
        >
          <span className="font-bold text-body underline">Filter</span>
          <Chevron open={filterOpen} />
        </button>

        {filterOpen && (
          <div
            className="flex flex-col gap-xm border-grey-00 border-b bg-grey-00 p-xm"
            id="pharmacy-filter-panel"
          >
            <div className="flex flex-col gap-xs">
              <Button
                aria-busy={locationState === 'loading'}
                aria-pressed={locationState === 'success'}
                className="self-start"
                disabled={locationState === 'loading'}
                onClick={() =>
                  locationState === 'success'
                    ? onClearLocation()
                    : onRequestLocation()
                }
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
                  className="text-mid-grey-00"
                  size="body-sm"
                >
                  {locationStatus}
                </Text>
              )}
            </div>

            <Input
              autoComplete="off"
              label="Search by name or place"
              onChange={(event) =>
                dispatch({ type: 'set-search', value: event.target.value })
              }
              placeholder="e.g. Sparman, Collins, Oistins"
              type="search"
              value={filters.search}
            />

            <FilterGroup
              hint="Free at government polyclinics; a small dispensing fee at private pharmacies that take the Drug Service subsidy."
              title="Cost and type"
            >
              <Select
                label="Pharmacy type"
                onChange={(event) =>
                  dispatch({
                    type: 'set-type',
                    value:
                      event.target.value === 'government' ||
                      event.target.value === 'private-sbs'
                        ? event.target.value
                        : 'all',
                  })
                }
                value={filters.type}
              >
                <option value="all">All pharmacies</option>
                <option value="government">Government (free)</option>
                <option value="private-sbs">Private (takes subsidy)</option>
              </Select>
              <Checkbox
                checked={filters.subsidisedOnly}
                id="filter-subsidised"
                label="Free and subsidised medication only"
                onChange={(event) =>
                  dispatch({
                    type: 'set-subsidised-only',
                    value: event.target.checked,
                  })
                }
              />
            </FilterGroup>

            <FilterGroup
              hint="The colour of the slip your doctor gave you. Yellow and green (GEHP) slips are filled at government pharmacies."
              title="Prescription slip"
            >
              <Select
                label="Slip colour"
                onChange={(event) =>
                  dispatch({
                    type: 'set-slip',
                    value:
                      event.target.value === 'white' ||
                      event.target.value === 'yellow' ||
                      event.target.value === 'green'
                        ? event.target.value
                        : 'any',
                  })
                }
                value={filters.slip}
              >
                <option value="any">Any slip</option>
                <option value="white">White — Drug Service</option>
                <option value="yellow">Yellow — GEHP</option>
                <option value="green">Green — GEHP dependant</option>
              </Select>
            </FilterGroup>

            <FilterGroup
              hint="Shows only pharmacies open right now, in Barbados time. Pharmacies with no confirmed hours are not shown — call to check. Hours can change on public holidays."
              title="Opening hours"
            >
              <Checkbox
                checked={filters.openNow}
                id="filter-open-now"
                label="Open right now"
                onChange={(event) =>
                  dispatch({ type: 'set-open-now', value: event.target.checked })
                }
              />
            </FilterGroup>

            <FilterGroup defaultOpen={false} title="Parish">
              {PARISHES.map((name) => (
                <Checkbox
                  checked={filters.parishes.includes(name)}
                  id={`parish-${name}`}
                  key={name}
                  label={name}
                  onChange={() =>
                    dispatch({ type: 'toggle-parish', parish: name })
                  }
                />
              ))}
            </FilterGroup>
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-col gap-s pt-xs">
            <div className="flex flex-wrap items-center gap-xs">
              {tags.map((tag) => (
                <button
                  className="inline-flex items-center gap-2 bg-teal-10 p-2.5 font-medium hover:bg-teal-40"
                  key={tag.key}
                  onClick={() => dispatch(tag.action)}
                  type="button"
                >
                  {tag.label}
                  <CloseIcon />
                  <span className="sr-only">Remove filter</span>
                </button>
              ))}
            </div>
            <button
              className="self-start font-semibold text-red-00 underline"
              onClick={() => {
                dispatch({ type: 'clear-all' })
                onClearLocation()
              }}
              type="button"
            >
              Clear all
            </button>
          </div>
        )}
      </div>
    </div>
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
    <div className="flex w-full flex-col gap-s border-mid-grey-00 border-b pb-s">
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2.5"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Heading as="h3" size="h4">
          {title}
        </Heading>
        <span className="text-teal-00">
          <Chevron open={open} />
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-s">
          {hint && (
            <Text as="p" className="text-mid-grey-00" size="body-sm">
              {hint}
            </Text>
          )}
          {children}
        </div>
      )}
    </div>
  )
}
