/**
 * Finder sidebar: locate button, search, filter accordion groups and the
 * removable filter tags. Presentational over the finder's filter state -
 * every change goes through the dispatched actions.
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
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { PARISHES } from '../-data/pharmacies'
import type { FilterAction, FilterState } from '../-lib/finder-filters'
import { SLIP_COLOURS_HREF } from '../-lib/routes'
import { SLIP_COLOURS, SLIP_LABELS } from '../-lib/slips'
import { Chevron, CloseIcon } from './icons'

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
  // Open by default on desktop, where the panel sits beside the results -
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
            label: `${filters.slip.charAt(0).toUpperCase()}${filters.slip.slice(1)} prescription`,
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

  const canReset = Boolean(
    filters.search ||
    filters.parishes.length ||
    filters.type !== 'all' ||
    filters.slip !== 'any' ||
    filters.openNow ||
    !filters.subsidisedOnly ||
    locationStatus,
  )

  const locationLabel =
    locationState === 'loading'
      ? 'Finding your location…'
      : locationState === 'success'
        ? 'Location on (turn off)'
        : 'Use my location'

  return (
    <div className="mb-m flex flex-col gap-m lg:mb-0 print:hidden">
      <Heading as="h2" className="govbb-visually-hidden">
        Filter pharmacies
      </Heading>
      <div>
        <button
          aria-controls="pharmacy-filter-panel"
          aria-expanded={filterOpen}
          className="flex w-full items-center gap-xs border-grey-70 border-b py-3 text-green-80"
          onClick={() => setFilterOpen((open) => !open)}
          type="button"
        >
          <Text as="span" className="underline" weight="bold">
            Filter
          </Text>
          <Chevron open={filterOpen} />
        </button>

        {filterOpen && (
          <div
            className="flex flex-col gap-xm border-grey-20 border-b bg-grey-20 p-xm"
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
                {locationLabel}
              </Button>
            </div>

            <Input
              autoComplete="off"
              label="Search by name or place"
              onChange={(event) =>
                dispatch({ type: 'set-search', value: event.target.value })
              }
              placeholder="e.g. Winston Scott, Oistins"
              type="search"
              value={filters.search}
            />

            <FilterGroup title="Cost and type">
              <Select
                label="Pharmacy type"
                description="Covered medication is free at government pharmacies for eligible patients. Participating private pharmacies charge a dispensing fee."
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
                <option value="all">All pharmacy types</option>
                <option value="government">Government</option>
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

            <FilterGroup title="Prescription colour">
              <Select
                label="Colour"
                description="The colour of the prescription your doctor gave you. Yellow and green (GEHP) prescriptions are filled at government pharmacies. Call to check your medication is covered."
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
                <option value="any">Any colour</option>
                {SLIP_COLOURS.map((slip) => (
                  <option key={slip} value={slip}>
                    {SLIP_LABELS[slip]}
                  </option>
                ))}
              </Select>
              <Link href={SLIP_COLOURS_HREF}>
                What prescription colours mean
              </Link>
            </FilterGroup>

            <FilterGroup title="Opening hours">
              <Checkbox
                checked={filters.openNow}
                id="filter-open-now"
                label="Open right now"
                description="Uses Barbados time and listed dispensing hours. Pharmacies with unconfirmed hours today are excluded. Call before travelling."
                onChange={(event) =>
                  dispatch({
                    type: 'set-open-now',
                    value: event.target.checked,
                  })
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

        <Text as="p" role="status" className="text-grey-70" size="body-sm">
          {locationStatus}
        </Text>

        {(tags.length > 0 || canReset) && (
          <div className="flex flex-col gap-s pt-xs">
            <div className="flex flex-wrap items-center gap-xs">
              {tags.map((tag) => (
                <button
                  className="inline-flex items-center gap-2 bg-teal-10 p-2.5 hover:bg-teal-20"
                  key={tag.key}
                  onClick={() => dispatch(tag.action)}
                  type="button"
                >
                  <Text as="span">{tag.label}</Text>
                  <CloseIcon />
                  <span className="govbb-visually-hidden">Remove filter</span>
                </button>
              ))}
            </div>
            {canReset && (
              <button
                className="govbb-link self-start"
                onClick={() => {
                  dispatch({ type: 'clear-all' })
                }}
                type="button"
              >
                <Text as="span" weight="bold">
                  Reset filters
                </Text>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterGroup({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="flex w-full flex-col gap-s border-grey-70 border-b pb-s">
      <Heading as="h3" size="h4">
        <button
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2.5 text-left"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span>{title}</span>
          <span className="text-teal-80">
            <Chevron open={open} />
          </span>
        </button>
      </Heading>
      {open && <div className="flex flex-col gap-s">{children}</div>}
    </div>
  )
}
