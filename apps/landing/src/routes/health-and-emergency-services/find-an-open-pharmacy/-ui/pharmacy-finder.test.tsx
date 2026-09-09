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
import { PHARMACY_CONTENT } from '../-data/pharmacies'
import {
  ALL_DAY_FIXTURE,
  CLOSED_FIXTURE,
  GOVERNMENT_FIXTURE,
  PHARMACY_CONTENT_FIXTURE,
  PRIVATE_FIXTURE,
  SPLIT_FIXTURE,
  UNKNOWN_FIXTURE,
  WEEKLY_HOURS_FIXTURE,
} from '../-data/pharmacy-fixtures'
import { formatCopy } from '../-lib/copy'
import { DEFAULT_FILTERS, matchesFilters } from '../-lib/finder-filters'
import { SLIP_COLOURS_HREF } from '../-lib/routes'
import { FindOpenPharmacyPage } from './find-page'
import { PharmacyDetailPage } from './detail-page'
import { PharmacyFinder } from './pharmacy-finder'
import { WeeklyHoursRows } from './weekly-hours'

const FIXTURE_PHARMACIES = PHARMACY_CONTENT_FIXTURE.pharmacies
const copy = PHARMACY_CONTENT_FIXTURE.copy

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
  it('renders published content identically through the default and explicit content props', () => {
    expect(renderToString(<FindOpenPharmacyPage />)).toBe(
      renderToString(<FindOpenPharmacyPage content={PHARMACY_CONTENT} />),
    )
    expect(
      renderToString(<PharmacyDetailPage pharmacy={PRIVATE_FIXTURE} />),
    ).toBe(
      renderToString(
        <PharmacyDetailPage
          pharmacy={PRIVATE_FIXTURE}
          content={PHARMACY_CONTENT}
        />,
      ),
    )
  })

  it('previews edited page copy, review date and records, including empty-result recovery counts', () => {
    const publishedBefore = JSON.stringify(PHARMACY_CONTENT)
    const draft = structuredClone(PHARMACY_CONTENT_FIXTURE)
    draft.lastUpdated = '2027-01-06'
    draft.copy.page.title = 'Draft pharmacy locator'
    draft.copy.page.introduction = 'Draft guidance for this locator.'
    draft.copy.finder.searchLabel = 'Search draft pharmacies'
    draft.copy.finder.oneMatch = 'One draft match'
    draft.copy.drugService.phone = '(246) 555-0199'
    draft.pharmacies = [{ ...PRIVATE_FIXTURE, name: 'Draft Branch' }]

    const view = render(<FindOpenPharmacyPage content={draft} />)
    expect(
      screen.getByRole('heading', { level: 1, name: draft.copy.page.title }),
    ).toBeTruthy()
    expect(
      screen.getByText(draft.copy.page.introduction, { exact: false }),
    ).toBeTruthy()
    expect(
      screen.getByText(
        formatCopy(draft.copy.page.lastUpdated, { date: 'January 6th, 2027' }),
      ),
    ).toBeTruthy()
    expect(screen.getByText(draft.copy.finder.oneMatch)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Draft Branch' })).toBeTruthy()
    expect(
      screen.queryByRole('link', { name: PRIVATE_FIXTURE.name }),
    ).toBeNull()
    expect(
      screen
        .getByRole('link', { name: draft.copy.drugService.phone })
        .getAttribute('href'),
    ).toBe('tel:+12465550199')

    const updated = {
      ...draft,
      pharmacies: [...draft.pharmacies, GOVERNMENT_FIXTURE],
    }
    view.rerender(<FindOpenPharmacyPage content={updated} />)
    expect(
      screen.getByText(formatCopy(copy.finder.allMatches, { count: 2 })),
    ).toBeTruthy()
    fireEvent.change(
      screen.getByRole('searchbox', { name: draft.copy.finder.searchLabel }),
      { target: { value: 'absent branch' } },
    )
    expect(
      screen.getByText(
        formatCopy(copy.noResults.matchCount, { count: 2, total: 2 }),
      ),
    ).toBeTruthy()
    fireEvent.click(
      screen
        .getByText(
          formatCopy(copy.noResults.clearSearch, { query: 'absent branch' }),
        )
        .closest('button')!,
    )
    expect(screen.getByRole('link', { name: 'Draft Branch' })).toBeTruthy()
    expect(JSON.stringify(PHARMACY_CONTENT)).toBe(publishedBefore)
  })

  it('previews detail edits and nearest alternatives entirely from the supplied draft', () => {
    const draft = structuredClone(PHARMACY_CONTENT_FIXTURE)
    const pharmacy = {
      ...PRIVATE_FIXTURE,
      name: 'Draft Detail Branch',
      notes: 'Draft branch guidance.',
      hours: SPLIT_FIXTURE.hours,
      bankHolidayHours: [],
      phone: '(246) 555-0190',
      phoneExtension: '9',
      additionalPhones: ['(246) 555-0191'],
      whatsapp: '(246) 555-0192',
    }
    draft.lastUpdated = '2027-01-06'
    draft.copy.detail.contactHeading = 'Draft contact help'
    draft.copy.detail.callAhead = 'Draft advice before travelling.'
    draft.copy.slips.heading = 'Draft prescription guidance'
    draft.pharmacies = [
      pharmacy,
      { ...GOVERNMENT_FIXTURE, name: 'Draft Alternative' },
    ]
    render(<PharmacyDetailPage pharmacy={pharmacy} content={draft} />)
    expect(
      screen.getByRole('heading', { level: 1, name: pharmacy.name }),
    ).toBeTruthy()
    expect(screen.getByText(pharmacy.notes)).toBeTruthy()
    expect(
      screen.getByText('8:00 am to midday and 1:00 pm to 5:00 pm'),
    ).toBeTruthy()
    expect(
      screen.getByText(copy.hours.publicHoliday).nextElementSibling
        ?.textContent,
    ).toBe(copy.hours.closed)
    expect(
      screen.getByRole('heading', { name: draft.copy.detail.contactHeading }),
    ).toBeTruthy()
    expect(screen.getByText(draft.copy.detail.callAhead)).toBeTruthy()
    expect(
      screen.getByText(
        formatCopy(copy.detail.extensionMessage, { extension: '9' }),
      ),
    ).toBeTruthy()
    expect(
      screen.getByRole('link', { name: pharmacy.phone }).getAttribute('href'),
    ).toBe('tel:+12465550190')
    expect(
      screen
        .getByRole('link', { name: pharmacy.additionalPhones[0] })
        .getAttribute('href'),
    ).toBe('tel:+12465550191')
    expect(
      screen
        .getByRole('link', { name: copy.detail.whatsappLabel })
        .getAttribute('href'),
    ).toContain('https://wa.me/12465550192?')
    const slips = within(
      screen.getByRole('region', { name: draft.copy.slips.heading }),
    )
    expect(slips.getAllByText(/Draft Alternative/)).toHaveLength(2)
    expect(slips.queryByText(/Example Polyclinic/)).toBeNull()
  })

  it('server-renders every default result with working detail and phone links', () => {
    const html = renderToString(
      <PharmacyFinder content={PHARMACY_CONTENT_FIXTURE} />,
    )
    for (const pharmacy of FIXTURE_PHARMACIES.filter((p) =>
      matchesFilters(p, DEFAULT_FILTERS, null),
    )) {
      expect(html).toContain(`/find-an-open-pharmacy/${pharmacy.slug}`)
    }
    expect(html).toContain('href="tel:+1246')
    expect(html).not.toContain('Loading pharmacies')
    expect(html).not.toContain('Show 12 more')
  })

  it('shows the full directory and excludes unknown hours only when open now is selected', () => {
    render(<PharmacyFinder content={PHARMACY_CONTENT_FIXTURE} />)
    expect(
      screen.getByText(
        formatCopy(copy.finder.pagedMatches, { visible: 12, count: 15 }),
      ),
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: copy.finder.subsidisedLabel,
      }),
    )
    expect(
      screen.getByText(
        formatCopy(copy.finder.pagedMatches, { visible: 12, count: 16 }),
      ),
    ).toBeTruthy()
    fireEvent.change(
      screen.getByRole('searchbox', { name: copy.finder.searchLabel }),
      { target: { value: UNKNOWN_FIXTURE.name } },
    )
    expect(
      screen.getByRole('link', { name: UNKNOWN_FIXTURE.name }),
    ).toBeTruthy()
    expect(screen.getByText(copy.hours.unknownToday)).toBeTruthy()
    fireEvent.click(
      screen.getByRole('checkbox', { name: copy.finder.openNowLabel }),
    )
    expect(
      screen.queryByRole('link', { name: UNKNOWN_FIXTURE.name }),
    ).toBeNull()
    fireEvent.click(
      screen.getByRole('checkbox', { name: copy.finder.openNowLabel }),
    )
    expect(
      screen.getByRole('link', { name: UNKNOWN_FIXTURE.name }),
    ).toBeTruthy()
  })

  it('filters open, closed, split-shift and all-day schedules using fixed records', () => {
    render(<PharmacyFinder content={PHARMACY_CONTENT_FIXTURE} />)
    fireEvent.click(
      screen.getByRole('checkbox', { name: copy.finder.openNowLabel }),
    )
    const search = screen.getByRole('searchbox', {
      name: copy.finder.searchLabel,
    })
    for (const [pharmacy, expected] of [
      [PRIVATE_FIXTURE, true],
      [CLOSED_FIXTURE, false],
      [SPLIT_FIXTURE, false],
      [ALL_DAY_FIXTURE, true],
    ] as const) {
      fireEvent.change(search, { target: { value: pharmacy.name } })
      expect(Boolean(screen.queryByRole('link', { name: pharmacy.name }))).toBe(
        expected,
      )
    }
    act(() => vi.setSystemTime(new Date('2026-09-07T17:00:00Z')))
    act(() => vi.advanceTimersByTime(60_000))
    fireEvent.change(search, { target: { value: SPLIT_FIXTURE.name } })
    expect(screen.getByRole('link', { name: SPLIT_FIXTURE.name })).toBeTruthy()
  })

  it('shows a complete weekly schedule and all contact channels from a fixed record', () => {
    const pharmacy = PRIVATE_FIXTURE
    render(
      <PharmacyDetailPage
        pharmacy={pharmacy}
        content={PHARMACY_CONTENT_FIXTURE}
      />,
    )
    expect(
      screen.getByRole('heading', { name: pharmacy.name, level: 1 }),
    ).toBeTruthy()
    for (const [day, hours] of [
      [
        formatCopy(copy.hours.todayLabel, { day: 'Monday' }),
        '8:00 am to 5:00 pm',
      ],
      ['Friday', '8:00 am to 6:00 pm'],
      ['Saturday', '8:00 am to 4:30 pm'],
      ['Sunday', copy.hours.closed],
    ]) {
      expect(screen.getByText(day).nextElementSibling?.textContent).toBe(hours)
    }
    expect(
      screen
        .getByRole('link', { name: PRIVATE_FIXTURE.phone })
        .getAttribute('href'),
    ).toBe('tel:+12465550100')
    expect(
      screen
        .getByRole('link', { name: PRIVATE_FIXTURE.additionalPhones![0] })
        .getAttribute('href'),
    ).toBe('tel:+12465550101')
  })

  it('ignores a late location callback after reset and after unmount', () => {
    const view = render(<PharmacyFinder content={PHARMACY_CONTENT_FIXTURE} />)
    fireEvent.click(screen.getByRole('button', { name: copy.location.use }))
    fireEvent.click(
      screen.getByRole('button', { name: copy.finder.resetFiltersLabel }),
    )
    act(() => success(position))
    expect(
      screen.queryByRole('button', { name: copy.location.active }),
    ).toBeNull()
    expect(window.location.search).toBe('')
    fireEvent.click(screen.getByRole('button', { name: copy.location.use }))
    view.unmount()
    act(() => success(position))
    expect(window.location.search).toBe('')
  })

  it('hydrates shared filters and supports turning location off in Strict Mode', () => {
    window.history.replaceState({}, '', '/?type=private-sbs&slip=white&near=1')
    render(
      <StrictMode>
        <PharmacyFinder content={PHARMACY_CONTENT_FIXTURE} />
      </StrictMode>,
    )
    act(() => success(position))
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', {
        name: copy.finder.typeLabel,
      }).value,
    ).toBe('private-sbs')
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', {
        name: copy.finder.prescriptionLabel,
      }).value,
    ).toBe('white')
    expect(window.location.search).toBe('?type=private-sbs&slip=white&near=1')
    expect(window.location.search).not.toContain('13.1')
    fireEvent.click(screen.getByRole('button', { name: copy.location.active }))
    expect(window.location.search).toBe('?type=private-sbs&slip=white')
  })

  it('filters by prescription colour and recovers from conflicting filters', () => {
    const { container } = render(
      <PharmacyFinder content={PHARMACY_CONTENT_FIXTURE} />,
    )
    const colour = screen.getByRole<HTMLSelectElement>('combobox', {
      name: copy.finder.prescriptionLabel,
    })
    fireEvent.change(colour, { target: { value: 'yellow' } })
    expect(window.location.search).toBe('?slip=yellow')
    expect(
      [...container.querySelectorAll('li h3 a')]
        .map((link) => link.textContent)
        .sort(),
    ).toEqual(
      FIXTURE_PHARMACIES.filter((p) => p.type === 'government')
        .map((p) => p.name)
        .sort(),
    )

    fireEvent.change(
      screen.getByRole('combobox', { name: copy.finder.typeLabel }),
      {
        target: { value: 'private-sbs' },
      },
    )
    expect(
      screen.getByText(copy.noResults.privateNone, { exact: false }),
    ).toBeTruthy()
    fireEvent.click(screen.getByText(copy.noResults.anySlip).closest('button')!)
    expect(colour.value).toBe('any')
    expect(window.location.search).toBe('?type=private-sbs')
    expect(
      screen.getAllByText(copy.hours.privateSlipWarning).length,
    ).toBeGreaterThan(0)

    fireEvent.change(colour, { target: { value: 'white' } })
    fireEvent.click(
      screen.getByRole('button', { name: copy.finder.resetFiltersLabel }),
    )
    expect(colour.value).toBe('any')
    expect(window.location.search).toBe('')
  })

  it('shows slip guidance on pharmacy details and keeps unknown participation explicit', () => {
    const government = GOVERNMENT_FIXTURE
    const participating = PRIVATE_FIXTURE
    const unconfirmed = UNKNOWN_FIXTURE
    const { rerender } = render(
      <PharmacyDetailPage
        pharmacy={government}
        content={PHARMACY_CONTENT_FIXTURE}
      />,
    )
    const panel = within(
      screen.getByRole('region', { name: copy.slips.heading }),
    )
    expect(panel.getByText(copy.slips.labels.white)).toBeTruthy()
    expect(panel.getByText(copy.slips.labels.yellow)).toBeTruthy()
    expect(panel.getByText(copy.slips.labels.green)).toBeTruthy()
    expect(panel.getAllByText(copy.slips.governmentAccepted)).toHaveLength(2)
    expect(
      panel
        .getByRole('link', { name: copy.slips.helpLabel })
        .getAttribute('href'),
    ).toBe(SLIP_COLOURS_HREF)

    rerender(
      <PharmacyDetailPage
        pharmacy={participating}
        content={PHARMACY_CONTENT_FIXTURE}
      />,
    )
    expect(panel.getByText(copy.slips.privateAccepted)).toBeTruthy()

    rerender(
      <PharmacyDetailPage
        pharmacy={unconfirmed}
        content={PHARMACY_CONTENT_FIXTURE}
      />,
    )
    expect(panel.getAllByText(copy.slips.unconfirmed)).toHaveLength(3)
    expect(panel.queryByText(copy.slips.accepted)).toBeNull()
    expect(panel.queryByText(copy.slips.notAccepted)).toBeNull()
  })

  it('offers recovery after location denial and timeout', () => {
    render(<PharmacyFinder content={PHARMACY_CONTENT_FIXTURE} />)
    for (const code of [1, 3]) {
      fireEvent.click(screen.getByRole('button', { name: copy.location.use }))
      act(() => failure?.({ code } as GeolocationPositionError))
      expect(
        screen.getByText(
          code === 1 ? copy.location.permissionDenied : copy.location.timedOut,
        ),
      ).toBeTruthy()
      expect(
        screen.getByRole('button', { name: copy.location.use }),
      ).toBeTruthy()
    }
    expect(
      screen.getByRole('searchbox', { name: copy.finder.searchLabel }),
    ).toBeTruthy()
  })

  it('focuses the first added result and resets the result count when filters change', () => {
    const { container } = render(
      <PharmacyFinder content={PHARMACY_CONTENT_FIXTURE} />,
    )
    expect(
      container
        .querySelectorAll('li h3 a')[12]
        .closest('li')
        ?.classList.contains('hidden'),
    ).toBe(true)
    fireEvent.click(
      screen.getByRole('button', {
        name: formatCopy(copy.finder.showMore, { count: 3 }),
      }),
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
      screen.getByRole('searchbox', { name: copy.finder.searchLabel }),
      { target: { value: GOVERNMENT_FIXTURE.name } },
    )
    expect(screen.getByText(copy.finder.oneMatch)).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: copy.finder.resetFiltersLabel }),
    )
    expect(
      screen.getByText(
        formatCopy(copy.finder.pagedMatches, { visible: 12, count: 15 }),
      ),
    ).toBeTruthy()
  })

  it('highlights the holiday schedule instead of ordinary weekday hours', () => {
    const hours = WEEKLY_HOURS_FIXTURE
    render(
      <WeeklyHoursRows
        hours={hours}
        today="mon"
        todayIsHoliday
        bankHolidayHours={[{ opens: '10:00', closes: '14:00' }]}
      />,
    )
    expect(
      screen.getByText(copy.hours.publicHolidayToday).nextElementSibling
        ?.textContent,
    ).toBe('10:00 am to 2:00 pm')
    expect(
      screen.queryByText(formatCopy(copy.hours.todayLabel, { day: 'Monday' })),
    ).toBeNull()
  })

  it('keeps an unknown holiday schedule distinct from an explicitly closed holiday', () => {
    const props = {
      hours: WEEKLY_HOURS_FIXTURE,
      today: 'mon' as const,
      todayIsHoliday: true,
    }
    const view = render(
      <WeeklyHoursRows {...props} bankHolidayHours={undefined} />,
    )
    expect(
      screen.getByText(copy.hours.publicHolidayToday).nextElementSibling
        ?.textContent,
    ).toBe(copy.hours.unknownHoliday)
    view.rerender(<WeeklyHoursRows {...props} bankHolidayHours={[]} />)
    expect(
      screen.getByText(copy.hours.publicHolidayToday).nextElementSibling
        ?.textContent,
    ).toBe(copy.hours.closed)
  })
})
