// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '@/lib/analytics'
import { EMERGENCY_SHELTERS } from '../-data/emergency-shelters'
import { FindEmergencyShelterPage } from './find-page'
import { EmergencyShelterGuidancePage } from './guidance-page'

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }))

let success: PositionCallback
let failure: PositionErrorCallback | null

beforeEach(() => {
  vi.useFakeTimers()
  window.history.replaceState({}, '', '/')
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.mocked(trackEvent).mockClear()
})

function renderFinder() {
  render(
    <StrictMode>
      <FindEmergencyShelterPage />
    </StrictMode>,
  )
}

function eventsNamed(name: string) {
  return vi.mocked(trackEvent).mock.calls.filter(([event]) => event === name)
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function search(value: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search by name' }), {
    target: { value },
  })
}

const allData = () => JSON.stringify(vi.mocked(trackEvent).mock.calls)

describe('shelter finder tool-result (#3509)', () => {
  it('sends nothing for the view on arrival, even from a shared link', () => {
    window.history.replaceState({}, '', '/?q=Combermere&parish=St.%20Lucy')
    renderFinder()
    wait(5000)
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('sends one event once typing settles, with has_query and never the text', () => {
    renderFinder()
    for (const value of ['C', 'Co', 'Com', 'Comb']) {
      search(value)
      wait(900)
    }
    expect(eventsNamed('tool-result')).toHaveLength(0)

    wait(100)
    const matched = EMERGENCY_SHELTERS.filter((s) =>
      `${s.name} ${s.parish}`.toLowerCase().includes('comb'),
    ).length
    expect(matched).toBeGreaterThan(0)
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('tool-result', {
      tool: 'shelter-finder',
      outcome: 'results',
      results: matched,
      parishes: '',
      categories: '',
      amenities: 0,
      sort: 'parish',
      has_query: true,
      used_location: false,
    })
    expect(allData().toLowerCase()).not.toContain('comb')

    wait(5000)
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it('sends parish codes, categories, the amenity count and sort; no-results when nothing matches', () => {
    renderFinder()
    fireEvent.click(screen.getByRole('button', { name: 'Parish' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'St. Michael' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Christ Church' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Category 1' }))
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Has an accessible bathroom' }),
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), {
      target: { value: 'capacity' },
    })
    wait(1000)

    const matched = EMERGENCY_SHELTERS.filter(
      (s) =>
        ['St. Michael', 'Christ Church'].includes(s.parish) &&
        s.category === 1 &&
        s.access,
    ).length
    expect(eventsNamed('tool-result')).toEqual([
      [
        'tool-result',
        {
          tool: 'shelter-finder',
          outcome: matched > 0 ? 'results' : 'no-results',
          results: matched,
          // In the finder's own order, not the order they were chosen in.
          parishes: 'christ-church,saint-michael',
          categories: '1',
          amenities: 1,
          sort: 'capacity',
          has_query: false,
          used_location: false,
        },
      ],
    ])

    search('zzzz')
    wait(1000)
    expect(eventsNamed('tool-result').at(-1)?.[1]).toMatchObject({
      outcome: 'no-results',
      results: 0,
      has_query: true,
    })
  })

  it('sends only known parishes and categories from a shared link, never other text', () => {
    window.history.replaceState(
      {},
      '',
      '/?parish=john.doe@example.com,St.%20Lucy&cat=555-123-4567,2',
    )
    renderFinder()
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), {
      target: { value: 'name' },
    })
    wait(1000)

    expect(eventsNamed('tool-result')).toHaveLength(1)
    expect(eventsNamed('tool-result')[0][1]).toMatchObject({
      parishes: 'saint-lucy',
      categories: '2',
    })
    expect(allData()).not.toMatch(/example|john|555|4567/)
  })

  it.each([
    ['allowed', 'distance', true],
    ['denied', 'parish', false],
  ])(
    'sends one result for Nearest first when location is %s after the prompt was open for over a second',
    (answer, sort, usedLocation) => {
      renderFinder()
      fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), {
        target: { value: 'distance' },
      })
      wait(1500)
      expect(eventsNamed('tool-result')).toHaveLength(0)

      act(() => {
        if (answer === 'allowed') {
          success({
            coords: { latitude: 13.0975, longitude: -59.6123 },
          } as GeolocationPosition)
        } else {
          failure?.({ code: 1 } as GeolocationPositionError)
        }
      })
      wait(5000)
      expect(eventsNamed('tool-result')).toHaveLength(1)
      expect(eventsNamed('tool-result')[0][1]).toMatchObject({
        sort,
        used_location: usedLocation,
      })
    },
  )

  it('sends used_location for a location result, never the coordinates or a distance', () => {
    renderFinder()
    fireEvent.click(screen.getByRole('button', { name: /Use my location/ }))
    act(() => {
      success({
        coords: { latitude: 13.0975, longitude: -59.6123 },
      } as GeolocationPosition)
    })
    wait(1000)

    expect(eventsNamed('tool-result')).toHaveLength(1)
    expect(eventsNamed('tool-result')[0][1]).toMatchObject({
      outcome: 'results',
      results: EMERGENCY_SHELTERS.length,
      sort: 'distance',
      used_location: true,
    })
    expect(screen.getAllByText(/km/).length).toBeGreaterThan(0)
    expect(allData()).not.toMatch(/13\.0975|59\.6123|km/)
  })
})

describe('shelter finder tool-error (#3509)', () => {
  it.each([
    [1, 'location-denied'],
    [2, 'location-unavailable'],
  ])('sends location error code %i as %s', (code, error) => {
    renderFinder()
    fireEvent.click(screen.getByRole('button', { name: /Use my location/ }))
    act(() => failure?.({ code } as GeolocationPositionError))
    expect(eventsNamed('tool-error')).toEqual([
      ['tool-error', { tool: 'shelter-finder', error }],
    ])
  })

  it('sends no tool-error for a timeout, which the issue does not ask for', () => {
    renderFinder()
    fireEvent.click(screen.getByRole('button', { name: /Use my location/ }))
    act(() => failure?.({ code: 3 } as GeolocationPositionError))
    expect(eventsNamed('tool-error')).toHaveLength(0)
  })
})

describe('shelter finder tool-action call (#3509)', () => {
  function telLinks() {
    return [...document.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]')]
  }

  it('sends call to DEM, step find, from the notice and the no-results message', () => {
    renderFinder()
    search('zzzz')
    expect(telLinks()).toHaveLength(2)
    for (const link of telLinks()) fireEvent.click(link)
    expect(eventsNamed('tool-action')).toEqual([
      [
        'tool-action',
        { tool: 'shelter-finder', action: 'call', target: 'dem', step: 'find' },
      ],
      [
        'tool-action',
        { tool: 'shelter-finder', action: 'call', target: 'dem', step: 'find' },
      ],
    ])
  })

  it('sends call with step guidance and a code-defined target for every phone link on the guidance page', () => {
    render(<EmergencyShelterGuidancePage />)
    const links = telLinks()
    expect(links.length).toBeGreaterThan(40)
    for (const link of links) fireEvent.click(link)

    const actions = eventsNamed('tool-action')
    expect(actions).toHaveLength(links.length)
    const targets = actions.map(([, data]) => {
      expect(data).toMatchObject({
        tool: 'shelter-finder',
        action: 'call',
        step: 'guidance',
      })
      return (data as { target: string }).target
    })
    // An ID, never the number or a person's name.
    for (const target of targets) expect(target).toMatch(/^[a-z]+(-[a-z]+)*$/)
    expect(targets).toEqual(
      expect.arrayContaining([
        'dem',
        'deo-saint-michael-west-central',
        'deo-city-of-bridgetown',
        'police',
        'chief-shelter-warden',
      ]),
    )
    expect(allData()).not.toMatch(/\d{3}|Bradshaw|Hinds/)
  })
})
