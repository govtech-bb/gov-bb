// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PHARMACIES } from '../-data/pharmacies'
import { DEFAULT_FILTERS, matchesFilters } from '../-lib/finder-filters'
import { SLIP_COLOURS_HREF } from '../-lib/routes'
import { PharmacyDetailPage } from './detail-page'
import { PharmacyFinder } from './pharmacy-finder'
import { WeeklyHoursRows } from './weekly-hours'

let success: PositionCallback
let failure: PositionErrorCallback | null

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-07T16:00:00Z'))
  window.history.replaceState({}, '', '/')
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  )
  vi.stubGlobal(
    'navigator',
    Object.create(navigator, {
      geolocation: {
        value: {
          getCurrentPosition: vi.fn((onSuccess, onError) => {
            success = onSuccess
            failure = onError ?? null
          }),
          watchPosition: vi.fn(),
          clearWatch: vi.fn(),
        },
      },
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const position = {
  coords: { latitude: 13.1, longitude: -59.6 },
} as GeolocationPosition

describe('pharmacy finder', () => {
  it('server-renders every default result with working detail and phone links', () => {
    const html = renderToString(<PharmacyFinder />)
    for (const pharmacy of PHARMACIES.filter((p) =>
      matchesFilters(p, DEFAULT_FILTERS, null),
    )) {
      expect(html).toContain(`/find-an-open-pharmacy/${pharmacy.slug}`)
    }
    expect(html).toContain('href="tel:+1246')
    expect(html).not.toContain('Loading pharmacies')
    expect(html).not.toContain('Show 12 more')
  })

  it('shows the full directory when the subsidy filter is cleared', () => {
    render(<PharmacyFinder />)
    expect(screen.getByText('Showing 12 of 121 pharmacies')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Free and subsidised medication only',
      }),
    )
    expect(screen.getByText('Showing 12 of 163 pharmacies')).toBeTruthy()
  })

  it('excludes unknown hours only when open now is selected', () => {
    window.history.replaceState({}, '', '/?q=Market+Hill+Dispensary&all=1')
    render(<PharmacyFinder />)
    expect(
      screen.getByRole('link', { name: 'Market Hill Dispensary' }),
    ).toBeTruthy()
    expect(
      screen.getByText("Today's hours not confirmed. Call before travelling."),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Open right now' }))
    expect(
      screen.queryByRole('link', { name: 'Market Hill Dispensary' }),
    ).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Open right now' }))
    expect(
      screen.getByRole('link', { name: 'Market Hill Dispensary' }),
    ).toBeTruthy()
  })

  it('ignores a late location callback after reset and after unmount', () => {
    const view = render(<PharmacyFinder />)
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    act(() => success(position))
    expect(
      screen.queryByRole('button', { name: 'Location on (turn off)' }),
    ).toBeNull()
    expect(window.location.search).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    view.unmount()
    act(() => success(position))
    expect(window.location.search).toBe('')
  })

  it('hydrates shared filters and supports turning location off in Strict Mode', () => {
    window.history.replaceState({}, '', '/?type=private-sbs&slip=white&near=1')
    render(
      <StrictMode>
        <PharmacyFinder />
      </StrictMode>,
    )
    act(() => success(position))
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', {
        name: 'Pharmacy type',
      }).value,
    ).toBe('private-sbs')
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', { name: 'Colour' }).value,
    ).toBe('white')
    expect(window.location.search).toBe('?type=private-sbs&slip=white&near=1')
    expect(window.location.search).not.toContain('13.1')
    fireEvent.click(
      screen.getByRole('button', { name: 'Location on (turn off)' }),
    )
    expect(window.location.search).toBe('?type=private-sbs&slip=white')
  })

  it('filters by prescription colour and recovers from conflicting filters', () => {
    const { container } = render(<PharmacyFinder />)
    const colour = screen.getByRole<HTMLSelectElement>('combobox', {
      name: 'Colour',
    })
    fireEvent.change(colour, { target: { value: 'yellow' } })
    expect(window.location.search).toBe('?slip=yellow')
    expect(
      [...container.querySelectorAll('li h3 a')]
        .map((link) => link.textContent)
        .sort(),
    ).toEqual(
      PHARMACIES.filter((p) => p.type === 'government')
        .map((p) => p.name)
        .sort(),
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Pharmacy type' }), {
      target: { value: 'private-sbs' },
    })
    expect(
      screen.getByText(
        /^No private pharmacies accepting a yellow prescription were found\./,
      ),
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', {
        name: /Show pharmacies for any prescription colour/,
      }),
    )
    expect(colour.value).toBe('any')
    expect(window.location.search).toBe('?type=private-sbs')
    expect(
      screen.getAllByText(
        /Yellow or green \(GEHP\) prescriptions are not covered here/,
      ).length,
    ).toBeGreaterThan(0)

    fireEvent.change(colour, { target: { value: 'white' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(colour.value).toBe('any')
    expect(window.location.search).toBe('')
  })

  it('shows slip guidance on pharmacy details and keeps unknown participation explicit', () => {
    const government = PHARMACIES.find((p) => p.type === 'government')!
    const participating = PHARMACIES.find(
      (p) => p.pppStatus === 'participating',
    )!
    const unconfirmed = PHARMACIES.find((p) => p.pppStatus === 'unconfirmed')!
    const { rerender } = render(<PharmacyDetailPage pharmacy={government} />)
    const panel = within(
      screen.getByRole('region', { name: 'Prescriptions accepted' }),
    )
    expect(panel.getByText('White (Drug Service)')).toBeTruthy()
    expect(panel.getByText('Yellow (GEHP)')).toBeTruthy()
    expect(panel.getByText('Green (GEHP dependant)')).toBeTruthy()
    expect(
      panel.getAllByText(
        'Accepted for selected medications. Call to check yours is covered.',
      ),
    ).toHaveLength(2)
    expect(
      panel
        .getByRole('link', { name: 'What prescription colours mean' })
        .getAttribute('href'),
    ).toBe(SLIP_COLOURS_HREF)

    rerender(<PharmacyDetailPage pharmacy={participating} />)
    expect(
      panel.getByText('Accepted. A small dispensing fee applies.'),
    ).toBeTruthy()

    rerender(<PharmacyDetailPage pharmacy={unconfirmed} />)
    expect(
      panel.getAllByText(
        'Drug Service participation is not confirmed. Call to check whether this prescription is covered.',
      ),
    ).toHaveLength(3)
    expect(panel.queryByText('Accepted')).toBeNull()
    expect(panel.queryByText('Not accepted')).toBeNull()
  })

  it('offers recovery after location denial and timeout', () => {
    render(<PharmacyFinder />)
    for (const code of [1, 3]) {
      fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
      act(() => failure?.({ code } as GeolocationPositionError))
      expect(
        screen.getByText(
          code === 1
            ? /Location permission is blocked/
            : /location request timed out/,
        ),
      ).toBeTruthy()
      expect(
        screen.getByRole('button', { name: 'Use my location' }),
      ).toBeTruthy()
    }
    expect(
      screen.getByRole('searchbox', { name: 'Search by name or place' }),
    ).toBeTruthy()
  })

  it('focuses the first added result and resets the result count when filters change', () => {
    const { container } = render(<PharmacyFinder />)
    expect(
      container
        .querySelectorAll('li h3 a')[12]
        .closest('li')
        ?.classList.contains('hidden'),
    ).toBe(true)
    fireEvent.click(
      screen.getByRole('button', { name: /Show \d+ more pharmacies/ }),
    )
    expect(document.activeElement).toBe(
      container.querySelectorAll('li h3 a')[12],
    )
    expect(
      container
        .querySelectorAll('li h3 a')[12]
        .closest('li')
        ?.classList.contains('hidden'),
    ).toBe(false)
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search by name or place' }),
      { target: { value: 'winston' } },
    )
    expect(screen.getByText('Showing 1 pharmacy')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(screen.getByText(/^Showing 12 of/)).toBeTruthy()
  })

  it('highlights the holiday schedule instead of ordinary weekday hours', () => {
    const hours = PHARMACIES.find(
      (p) => p.slug === 'imart-pharmacy-lanterns-mall',
    )!.hours!
    render(
      <WeeklyHoursRows
        hours={hours}
        today="mon"
        todayIsHoliday
        bankHolidayHours={[{ opens: '10:00', closes: '14:00' }]}
      />,
    )
    expect(
      screen.getByText('Today, public holiday').nextElementSibling?.textContent,
    ).toBe('10:00 am to 2:00 pm')
    expect(screen.queryByText('Today, Monday')).toBeNull()
  })
})
