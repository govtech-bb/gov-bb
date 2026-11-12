// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '@/lib/analytics'
import { locateParish } from '../-lib/geo'
import { subscribeWaterAlerts } from '../-lib/water-alerts'
import type { WaterOutagesData } from '../-lib/water-alerts'
import { TITLE, WaterOutagesPage } from './outages-page'
import { SubscribeForm } from './subscribe-form'

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('../-lib/water-alerts', () => ({ subscribeWaterAlerts: vi.fn() }))
vi.mock('../-lib/geo', () => ({ locateParish: vi.fn() }))
vi.mock('./outage-map', () => ({
  default: ({
    counts,
    selected,
    onSelect,
  }: {
    counts: Record<string, number>
    selected: string
    onSelect: (value: string) => void
  }) => (
    <button
      aria-pressed={selected === 'saint-michael'}
      onClick={() => onSelect('saint-michael')}
      type="button"
    >
      Map St. Michael: {counts['saint-michael']} notice
    </button>
  ),
}))

const NOW = Date.parse('2026-06-23T16:00:00Z')
const DATA: WaterOutagesData = {
  now: NOW,
  checkedAt: new Date(NOW).toISOString(),
  failed: false,
  outages: [
    {
      id: 'current',
      title: 'Michael repair',
      parishes: ['saint-michael'],
      type: 'repair' as const,
    },
    {
      id: 'other',
      title: 'John repair',
      parishes: ['saint-john'],
      type: 'repair' as const,
    },
    {
      id: 'general',
      title: 'General advisory',
      parishes: [],
      type: 'notice' as const,
    },
    {
      id: 'past',
      title: 'Previous repair',
      parishes: ['saint-michael'],
      type: 'repair' as const,
      endsAt: '2026-06-22T16:00:00Z',
    },
  ].map((notice) => ({
    ...notice,
    link: 'https://barbadoswaterauthority.com/notice',
    published: new Date(NOW).toISOString(),
    summary: 'Read the published notice for affected areas.',
  })),
}

let success: PositionCallback
let fail: PositionErrorCallback
const retry = vi.fn()

function TestPage({ data }: { data: WaterOutagesData }) {
  const [selected, setSelected] = useState('')
  return (
    <WaterOutagesPage
      data={data}
      selected={selected}
      onSelect={setSelected}
      onRetry={retry}
      retrying={false}
    />
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'navigator',
    Object.create(navigator, {
      geolocation: {
        value: {
          getCurrentPosition: vi.fn(
            (onSuccess: PositionCallback, onError: PositionErrorCallback) => {
              success = onSuccess
              fail = onError
            },
          ),
        },
      },
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

describe('water outages page', () => {
  it('server-renders notices before the browser-only map loads', () => {
    const html = renderToString(<TestPage data={DATA} />)
    expect(html).toContain('Michael repair')
    expect(html).toContain('Loading the parish map')
    expect(html).not.toContain('leaflet-container')
    expect(html.indexOf('Michael repair')).toBeLessThan(
      html.indexOf('Loading the parish map'),
    )
    expect(html.indexOf('Loading the parish map')).toBeLessThan(
      html.indexOf('Get email alerts'),
    )
  })

  it('keeps the title and sign-up available when the live feed fails', () => {
    render(<TestPage data={{ ...DATA, failed: true, outages: [] }} />)
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy()
    expect(screen.getByRole('link', { name: /BWA website/ })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Get email alerts' }),
    ).toBeTruthy()
    expect(screen.queryByText(/There are no current BWA notices/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('filters from the map and dropdown while keeping general notices visible', async () => {
    render(<TestPage data={DATA} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Map St. Michael: 1 notice' }),
    )
    const parish = screen.getByRole<HTMLSelectElement>('combobox', {
      name: 'Choose a parish',
    })
    expect(parish.value).toBe('saint-michael')
    expect(screen.getByRole('heading', { name: 'Michael repair' })).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'General advisory' }),
    ).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'John repair' })).toBeNull()
    expect(screen.getByText('Older notices (1)')).toBeTruthy()
    expect(screen.getByText('Older notice')).toBeTruthy()
    expect(screen.queryByText('Ended')).toBeNull()
    fireEvent.change(parish, { target: { value: 'saint-john' } })
    expect(screen.getByRole('heading', { name: 'John repair' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Michael repair' })).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'General advisory' }),
    ).toBeTruthy()
  })

  it.each(['outside Barbados', 'boundary load rejection'])(
    'recovers from %s during location lookup',
    async (failure) => {
      if (failure === 'outside Barbados')
        vi.mocked(locateParish).mockResolvedValue(null)
      else vi.mocked(locateParish).mockRejectedValue(new Error('lookup failed'))
      render(<TestPage data={DATA} />)
      await screen.findByRole('button', { name: /Map St. Michael/ })
      fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
      await act(async () => {
        success({
          coords: { latitude: 51.5, longitude: -0.1 },
        } as GeolocationPosition)
      })
      expect(
        screen.getByText(/We could not find your parish in Barbados/),
      ).toBeTruthy()
      expect(
        screen.getByRole<HTMLButtonElement>('button', {
          name: 'Use my location',
        }).disabled,
      ).toBe(false)
    },
  )

  it('keeps a manual choice when an earlier location request finishes', async () => {
    vi.mocked(locateParish).mockResolvedValue({
      value: 'saint-michael',
      exact: true,
    })
    render(<TestPage data={DATA} />)
    await screen.findByRole('button', { name: /Map St. Michael/ })
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    const parish = screen.getByRole<HTMLSelectElement>('combobox', {
      name: 'Choose a parish',
    })
    fireEvent.change(parish, { target: { value: 'saint-john' } })
    await act(async () => {
      success({
        coords: { latitude: 13.1, longitude: -59.61 },
      } as GeolocationPosition)
    })
    expect(parish.value).toBe('saint-john')
  })

  it('focuses invalid email and lets a failed sign-up retry successfully', async () => {
    vi.mocked(subscribeWaterAlerts)
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({
        ok: true,
        message: 'Check your email to confirm.',
      })
    render(<SubscribeForm selectedArea="saint-john" selectedLabel="St. John" />)
    fireEvent.click(screen.getByRole('button', { name: 'Get email alerts' }))
    const form = screen.getByRole('form', { name: 'Get email alerts' })
    const input = screen.getByRole('textbox', { name: 'Your email address' })
    expect(document.activeElement).toBe(input)
    fireEvent.submit(form)
    expect(subscribeWaterAlerts).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(input, { target: { value: 'resident@example.com' } })
    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', {
        name: 'Area for alerts',
      }).value,
    ).toBe('saint-john')
    fireEvent.submit(form)
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Check your email to confirm.',
    )
    expect(subscribeWaterAlerts).toHaveBeenLastCalledWith({
      data: { email: 'resident@example.com', area: 'saint-john' },
    })
  })

  it('cancels without sending, restores focus, and clears stale errors when reopened', () => {
    render(<SubscribeForm selectedArea="saint-john" selectedLabel="St. John" />)
    fireEvent.click(screen.getByRole('button', { name: 'Get email alerts' }))
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Your email address' }),
      {
        target: { value: 'unfinished@' },
      },
    )
    fireEvent.submit(screen.getByRole('form'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form')).toBeNull()
    const trigger = screen.getByRole('button', { name: 'Get email alerts' })
    expect(document.activeElement).toBe(trigger)
    expect(subscribeWaterAlerts).not.toHaveBeenCalled()
    fireEvent.click(trigger)
    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Your email address',
    })
    expect(input.value).toBe('unfinished@')
    expect(input.getAttribute('aria-invalid')).not.toBe('true')
  })

  it('keeps Cancel unavailable while the confirmation request is being sent', async () => {
    let finish!: (value: { ok: boolean; message: string }) => void
    vi.mocked(subscribeWaterAlerts).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    render(<SubscribeForm selectedArea="" selectedLabel={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get email alerts' }))
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Your email address' }),
      {
        target: { value: 'resident@example.com' },
      },
    )
    fireEvent.submit(screen.getByRole('form'))
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' })
        .disabled,
    ).toBe(true)
    await act(async () => {
      finish({ ok: false, message: 'Please try again.' })
    })
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' })
        .disabled,
    ).toBe(false)
  })
})

describe('water outages events (#3510)', () => {
  const tool = 'water-outages'

  // Keeps jsdom from following the BWA and phone links when they are clicked.
  function stopNavigation() {
    document.addEventListener('click', (e) => e.preventDefault(), {
      once: true,
    })
  }

  it('sends tool-result when a parish is chosen from the list, the map or the location', async () => {
    vi.mocked(locateParish).mockResolvedValue({
      value: 'saint-john',
      exact: true,
    })
    render(<TestPage data={DATA} />)
    const parish = screen.getByRole<HTMLSelectElement>('combobox', {
      name: 'Choose a parish',
    })
    fireEvent.change(parish, { target: { value: 'saint-michael' } })
    fireEvent.click(
      await screen.findByRole('button', { name: /Map St. Michael/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    await act(async () => {
      success({
        coords: { latitude: 13.1, longitude: -59.61 },
      } as GeolocationPosition)
    })
    const chosen = (chosen_by: string) => ({
      tool,
      outcome: 'parish-chosen',
      parish: 'saint-michael',
      chosen_by,
      active_notices: 1,
      past_notices: 1,
    })
    expect(vi.mocked(trackEvent).mock.calls).toEqual([
      ['tool-result', chosen('list')],
      ['tool-result', chosen('map')],
      [
        'tool-result',
        {
          tool,
          outcome: 'parish-chosen',
          parish: 'saint-john',
          chosen_by: 'location',
          active_notices: 1,
          past_notices: 0,
        },
      ],
    ])
  })

  it('sends nothing when the list goes back to All of Barbados', () => {
    render(<TestPage data={DATA} />)
    const parish = screen.getByRole('combobox', { name: 'Choose a parish' })
    fireEvent.change(parish, { target: { value: 'saint-john' } })
    vi.mocked(trackEvent).mockClear()
    fireEvent.change(parish, { target: { value: '' } })
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('sends tool-action for a BWA notice link and the BWA phone number', () => {
    render(<TestPage data={DATA} />)
    stopNavigation()
    fireEvent.click(
      screen.getByRole('link', {
        name: 'Read the BWA notice about Michael repair',
      }),
    )
    stopNavigation()
    fireEvent.click(screen.getByRole('link', { name: '246-434-4292' }))
    expect(vi.mocked(trackEvent).mock.calls).toEqual([
      ['tool-action', { tool, action: 'open-notice' }],
      ['tool-action', { tool, action: 'call' }],
    ])
  })

  it.each([
    ['refused', 'location-denied', { code: 1 }],
    ['timed out', 'location-unavailable', { code: 3 }],
  ])('sends tool-error when the location is %s', (_, error, positionError) => {
    render(<TestPage data={DATA} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    act(() => {
      fail({
        ...positionError,
        PERMISSION_DENIED: 1,
      } as GeolocationPositionError)
    })
    expect(trackEvent).toHaveBeenCalledOnce()
    expect(trackEvent).toHaveBeenCalledWith('tool-error', { tool, error })
  })

  it.each(['outside Barbados', 'boundary load rejection'])(
    'sends location-unavailable for %s',
    async (failure) => {
      if (failure === 'outside Barbados')
        vi.mocked(locateParish).mockResolvedValue(null)
      else vi.mocked(locateParish).mockRejectedValue(new Error('lookup failed'))
      render(<TestPage data={DATA} />)
      fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
      await act(async () => {
        success({
          coords: { latitude: 51.5, longitude: -0.1 },
        } as GeolocationPosition)
      })
      expect(trackEvent).toHaveBeenCalledOnce()
      expect(trackEvent).toHaveBeenCalledWith('tool-error', {
        tool,
        error: 'location-unavailable',
      })
    },
  )

  it('sends location-unavailable when the browser has no location', () => {
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, { geolocation: { value: undefined } }),
    )
    render(<TestPage data={DATA} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    expect(trackEvent).toHaveBeenCalledWith('tool-error', {
      tool,
      error: 'location-unavailable',
    })
  })

  it('sends invalid-email from our check and from the browser check, and never submits', () => {
    render(<SubscribeForm selectedArea="" selectedLabel={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get email alerts' }))
    const input = screen.getByRole('textbox', { name: 'Your email address' })
    fireEvent.change(input, { target: { value: 'resident@example' } })
    fireEvent.submit(screen.getByRole('form'))
    fireEvent.invalid(input)
    const invalid = ['tool-error', { tool, error: 'invalid-email' }]
    expect(vi.mocked(trackEvent).mock.calls).toEqual([invalid, invalid])
    expect(subscribeWaterAlerts).not.toHaveBeenCalled()
  })

  it.each([
    [
      'sent',
      'subscribe-sent',
      () => Promise.resolve({ ok: true, message: 'Check your email.' }),
    ],
    [
      'refused',
      'subscribe-failed',
      () => Promise.resolve({ ok: false, message: 'Try again.' }),
    ],
    ['failed', 'subscribe-failed', () => Promise.reject(new Error('network'))],
  ])(
    'sends subscribe-submit with the parish, then the outcome when the request is %s',
    async (_, outcome, respond) => {
      vi.mocked(subscribeWaterAlerts).mockImplementation(respond)
      render(
        <SubscribeForm selectedArea="saint-john" selectedLabel="St. John" />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Get email alerts' }))
      fireEvent.change(
        screen.getByRole('textbox', { name: 'Your email address' }),
        { target: { value: 'resident@example.com' } },
      )
      await act(async () => {
        fireEvent.submit(screen.getByRole('form'))
      })
      expect(vi.mocked(trackEvent).mock.calls).toEqual([
        [
          'tool-action',
          { tool, action: 'subscribe-submit', target: 'saint-john' },
        ],
        ['tool-result', { tool, outcome }],
      ])
    },
  )

  it('sends the target "all" for a sign-up to All of Barbados', async () => {
    vi.mocked(subscribeWaterAlerts).mockResolvedValue({
      ok: true,
      message: 'Check your email.',
    })
    render(<SubscribeForm selectedArea="" selectedLabel={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get email alerts' }))
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Your email address' }),
      { target: { value: 'resident@example.com' } },
    )
    await act(async () => {
      fireEvent.submit(screen.getByRole('form'))
    })
    expect(trackEvent).toHaveBeenCalledWith('tool-action', {
      tool,
      action: 'subscribe-submit',
      target: 'all',
    })
  })

  // Privacy bar (ADR 0079): no email address and no coordinates, ever.
  it('never sends the email address or the coordinates', async () => {
    vi.mocked(locateParish).mockResolvedValue({
      value: 'saint-michael',
      exact: false,
    })
    vi.mocked(subscribeWaterAlerts).mockResolvedValue({
      ok: true,
      message: 'Check your email.',
    })
    render(<TestPage data={DATA} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    await act(async () => {
      success({
        coords: { latitude: 13.0987, longitude: -59.6145 },
      } as GeolocationPosition)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Get email alerts' }))
    const input = screen.getByRole('textbox', { name: 'Your email address' })
    fireEvent.change(input, { target: { value: 'resident' } })
    fireEvent.submit(screen.getByRole('form'))
    fireEvent.change(input, { target: { value: 'resident@example.com' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('form'))
    })
    const sent = JSON.stringify(vi.mocked(trackEvent).mock.calls)
    expect(vi.mocked(trackEvent).mock.calls.map(([name]) => name)).toEqual([
      'tool-result',
      'tool-error',
      'tool-action',
      'tool-result',
    ])
    for (const secret of ['resident', 'example.com', '@', '13.09', '59.61']) {
      expect(sent).not.toContain(secret)
    }
  })
})
