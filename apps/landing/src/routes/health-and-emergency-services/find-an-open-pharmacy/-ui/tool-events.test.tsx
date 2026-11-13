// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PHARMACIES } from '../-data/pharmacies'
import { DRUG_SERVICE_PHONE } from '../-lib/routes'
import { PharmacyDetailPage } from './detail-page'
import { FindOpenPharmacyPage } from './find-page'
import { PharmacyFinder } from './pharmacy-finder'

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ trackEvent }))

let success: PositionCallback
let failure: PositionErrorCallback | null

// jsdom cannot navigate; the click handlers are what is under test.
const stopNavigation = (event: Event) => event.preventDefault()

beforeEach(() => {
  trackEvent.mockClear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-07T16:00:00Z'))
  window.history.replaceState({}, '', '/')
  document.addEventListener('click', stopNavigation)
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
        },
      },
    }),
  )
})

afterEach(() => {
  cleanup()
  document.removeEventListener('click', stopNavigation)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const position = {
  coords: { latitude: 13.1, longitude: -59.6 },
} as GeolocationPosition

const pharmacy = (slug: string) => PHARMACIES.find((p) => p.slug === slug)!

/** The data of each call of one event, in order. */
const sent = (event: string) =>
  trackEvent.mock.calls
    .filter(([name]) => name === event)
    .map(([, data]) => data as Record<string, unknown>)

const settle = (ms = 1000) => act(() => vi.advanceTimersByTime(ms))

const search = (value: string) =>
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Search by name or place' }),
    { target: { value } },
  )

/** No event may carry search text, coordinates or a distance (ADR 0138). */
function expectNoPrivateData(...forbidden: string[]) {
  const payload = JSON.stringify(trackEvent.mock.calls).toLowerCase()
  for (const text of [...forbidden, '13.1', '-59.6', 'km', 'very close']) {
    expect(payload).not.toContain(text.toLowerCase())
  }
}

describe('pharmacy finder tool-result', () => {
  it('sends one result once the default list settles', () => {
    render(<PharmacyFinder />)
    settle(999)
    expect(sent('tool-result')).toEqual([])
    settle(1)
    expect(sent('tool-result')).toEqual([
      {
        tool: 'pharmacy-finder',
        outcome: 'results',
        results: 121,
        parishes: undefined,
        type: 'all',
        slip: 'any',
        subsidised_only: true,
        open_now: false,
        has_query: false,
        used_location: false,
      },
    ])
    settle(120_000)
    expect(sent('tool-result')).toHaveLength(1)
  })

  it('sends a shared link as one result, with parish codes and no search text', () => {
    window.history.replaceState(
      {},
      '',
      '/?q=Oistins&parish=St.+Michael,Christ+Church&type=private-sbs&slip=yellow&all=1&open=1',
    )
    render(<PharmacyFinder />)
    settle()
    expect(sent('tool-result')).toEqual([
      {
        tool: 'pharmacy-finder',
        outcome: 'no-results',
        results: 0,
        parishes: 'st-michael,christ-church',
        type: 'private-sbs',
        slip: 'yellow',
        subsidised_only: false,
        open_now: true,
        has_query: true,
        used_location: false,
      },
    ])
    expectNoPrivateData('Oistins')
  })

  it('sends one result per settled search, not per keystroke', () => {
    render(<PharmacyFinder />)
    settle()
    trackEvent.mockClear()

    for (const value of ['w', 'wi', 'win', 'wins', 'winst', 'winsto']) {
      search(value)
      settle(300)
    }
    search('winston')
    settle(999)
    expect(sent('tool-result')).toEqual([])
    settle(1)
    expect(sent('tool-result')).toEqual([
      expect.objectContaining({
        outcome: 'results',
        results: 1,
        has_query: true,
      }),
    ])

    search('')
    settle()
    expect(sent('tool-result')).toHaveLength(2)
    expect(sent('tool-result')[1]).toMatchObject({
      results: 121,
      has_query: false,
    })
    expectNoPrivateData('winston', 'winst')
  })

  it('flags a used location without sending coordinates or distances', () => {
    render(<PharmacyFinder />)
    settle()
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    act(() => success(position))
    settle()
    expect(screen.getAllByText(/ km away$/).length).toBeGreaterThan(0)
    expect(sent('tool-result')).toEqual([
      expect.objectContaining({ used_location: false }),
      {
        tool: 'pharmacy-finder',
        outcome: 'results',
        results: 121,
        parishes: undefined,
        type: 'all',
        slip: 'any',
        subsidised_only: true,
        open_now: false,
        has_query: false,
        used_location: true,
      },
    ])
    expectNoPrivateData()
  })
})

describe('pharmacy finder tool-error', () => {
  it('sends location-denied when permission is refused', () => {
    render(<PharmacyFinder />)
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    act(() => failure?.({ code: 1 } as GeolocationPositionError))
    expect(sent('tool-error')).toEqual([
      { tool: 'pharmacy-finder', error: 'location-denied' },
    ])
  })

  it.each([2, 3])(
    'sends location-unavailable when the position fails (code %i)',
    (code) => {
      render(<PharmacyFinder />)
      fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
      act(() => failure?.({ code } as GeolocationPositionError))
      expect(sent('tool-error')).toEqual([
        { tool: 'pharmacy-finder', error: 'location-unavailable' },
      ])
    },
  )

  it('sends location-unavailable when the browser has no geolocation', () => {
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, { geolocation: { value: undefined } }),
    )
    render(<PharmacyFinder />)
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    expect(sent('tool-error')).toEqual([
      { tool: 'pharmacy-finder', error: 'location-unavailable' },
    ])
  })

  it('sends nothing for a location request that was reset or unmounted', () => {
    const view = render(<PharmacyFinder />)
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    act(() => failure?.({ code: 1 } as GeolocationPositionError))
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    view.unmount()
    act(() => failure?.({ code: 1 } as GeolocationPositionError))
    expect(sent('tool-error')).toEqual([])
  })
})

describe('pharmacy finder tool-action', () => {
  it('sends card links, phone and directions with the pharmacy slug', () => {
    const felimar = pharmacy('felimar-plus-pharmacy')
    render(<FindOpenPharmacyPage />)
    search(felimar.name)
    fireEvent.click(screen.getByRole('link', { name: felimar.name }))
    fireEvent.click(screen.getByRole('link', { name: 'Full details' }))
    fireEvent.click(screen.getByRole('link', { name: `Call ${felimar.phone}` }))
    fireEvent.click(screen.getByRole('link', { name: /^Directions/ }))
    expect(sent('tool-action')).toEqual(
      ['view-detail', 'view-detail', 'call', 'directions'].map((action) => ({
        tool: 'pharmacy-finder',
        action,
        target: 'felimar-plus-pharmacy',
      })),
    )
  })

  it('sends the Drug Service phone and slip colours links on the find page', () => {
    const stationHill = pharmacy('station-hill-medical-complex-pharmacy')
    render(<FindOpenPharmacyPage />)
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Free and subsidised medication only',
      }),
    )
    search(stationHill.name)
    const card = screen
      .getByRole('link', { name: stationHill.name })
      .closest('li')!
    fireEvent.click(
      within(card).getByRole('link', { name: DRUG_SERVICE_PHONE }),
    )
    fireEvent.click(
      within(
        screen.getByRole('complementary', { name: 'Drug Service' }),
      ).getByRole('link', { name: DRUG_SERVICE_PHONE }),
    )
    fireEvent.click(
      screen.getByRole('link', { name: 'What prescription colours mean' }),
    )
    expect(sent('tool-action')).toEqual([
      {
        tool: 'pharmacy-finder',
        action: 'call-drug-service',
        target: 'station-hill-medical-complex-pharmacy',
      },
      { tool: 'pharmacy-finder', action: 'call-drug-service' },
      { tool: 'pharmacy-finder', action: 'slip-colours' },
    ])
  })

  it('sends every phone, directions and slip colours link on the detail page', () => {
    const felimar = pharmacy('felimar-plus-pharmacy')
    render(<PharmacyDetailPage pharmacy={felimar} />)
    fireEvent.click(screen.getByRole('link', { name: /^Get directions/ }))
    fireEvent.click(screen.getByRole('link', { name: `Call ${felimar.phone}` }))
    fireEvent.click(screen.getByRole('link', { name: felimar.phone }))
    fireEvent.click(
      screen.getByRole('link', { name: felimar.additionalPhones![0] }),
    )
    fireEvent.click(screen.getByRole('link', { name: DRUG_SERVICE_PHONE }))
    fireEvent.click(
      screen.getByRole('link', { name: 'What prescription colours mean' }),
    )
    expect(sent('tool-action')).toEqual(
      [
        'directions',
        'call',
        'call',
        'call',
        'call-drug-service',
        'slip-colours',
      ].map((action) => ({
        tool: 'pharmacy-finder',
        action,
        target: 'felimar-plus-pharmacy',
      })),
    )
  })

  it('sends both Drug Service phone links when a pharmacy lists no number', () => {
    render(
      <PharmacyDetailPage
        pharmacy={pharmacy('station-hill-medical-complex-pharmacy')}
      />,
    )
    const links = screen.getAllByRole('link', { name: DRUG_SERVICE_PHONE })
    expect(links).toHaveLength(2)
    for (const link of links) fireEvent.click(link)
    expect(sent('tool-action')).toEqual([
      {
        tool: 'pharmacy-finder',
        action: 'call-drug-service',
        target: 'station-hill-medical-complex-pharmacy',
      },
      {
        tool: 'pharmacy-finder',
        action: 'call-drug-service',
        target: 'station-hill-medical-complex-pharmacy',
      },
    ])
  })
})
