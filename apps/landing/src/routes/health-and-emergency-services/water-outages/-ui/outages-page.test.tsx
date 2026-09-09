// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { locateParish } from '../-lib/geo'
import { subscribeWaterAlerts } from '../-lib/water-alerts'
import type { WaterOutagesData } from '../-lib/water-alerts'
import { TITLE, WaterOutagesPage } from './outages-page'
import { SubscribeForm } from './subscribe-form'

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
          getCurrentPosition: vi.fn((onSuccess: PositionCallback) => {
            success = onSuccess
          }),
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
