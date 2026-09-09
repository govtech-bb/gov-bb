// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Browser, Map as LeafletMap } from 'leaflet'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PARISHES } from '../-lib/parishes'
import OutageMap from './outage-map'

const originalSvg = Browser.svg
const originalAny3d = Browser.any3d

beforeEach(() => {
  // JSDOM omits the SVG/3D probes Leaflet uses for paths and fractional zoom.
  Object.defineProperty(Browser, 'svg', { value: true, configurable: true })
  Object.defineProperty(Browser, 'any3d', { value: true, configurable: true })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(284)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(416)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Object.defineProperty(Browser, 'svg', { value: originalSvg })
  Object.defineProperty(Browser, 'any3d', { value: originalAny3d })
})

describe('water outage map', () => {
  it('names every parish and supports keyboard selection with updated pressed state', () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <OutageMap
        counts={{ 'saint-michael': 1 }}
        onSelect={onSelect}
        selected=""
      />,
    )
    for (const parish of PARISHES) {
      const marker = screen.getByRole('button', {
        name: new RegExp(`^${parish.label}:`),
      })
      expect(marker.getAttribute('tabindex')).toBe('0')
      expect(marker.classList.contains('water-outages-marker')).toBe(true)
    }
    const michael = screen.getByRole('button', {
      name: 'St. Michael: 1 current notice',
    })
    fireEvent.keyDown(michael, { key: 'Enter' })
    expect(onSelect).toHaveBeenLastCalledWith('saint-michael')
    expect(michael.getAttribute('aria-pressed')).toBe('false')

    rerender(
      <OutageMap
        counts={{ 'saint-michael': 2 }}
        onSelect={onSelect}
        selected="saint-michael"
      />,
    )
    expect(
      screen
        .getByRole('button', { name: 'St. Michael: 2 current notices' })
        .getAttribute('aria-pressed'),
    ).toBe('true')

    const john = screen.getByRole('button', {
      name: 'St. John: 0 current notices',
    })
    expect(fireEvent.keyDown(john, { key: ' ', cancelable: true })).toBe(false)
    expect(onSelect).toHaveBeenLastCalledWith('saint-john')
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('fits every parish on a narrow map, limits its extent, and pans immediately', () => {
    const setView = vi.spyOn(LeafletMap.prototype, 'setView')
    render(<OutageMap counts={{}} onSelect={vi.fn()} selected="" />)
    const map = setView.mock.instances[0] as LeafletMap
    expect(map.getZoom()).toBe(10.5)
    for (const parish of PARISHES) {
      const point = map.latLngToContainerPoint([parish.lat, parish.lon])
      expect(point.x).toBeGreaterThanOrEqual(32)
      expect(point.x).toBeLessThanOrEqual(284 - 32)
      expect(point.y).toBeGreaterThanOrEqual(32)
      expect(point.y).toBeLessThanOrEqual(416 - 32)
    }
    act(() => map.zoomOut(10))
    expect(map.getZoom()).toBe(10.5)

    act(() => map.setZoom(13))
    const before = map.getCenter().lng
    fireEvent.keyDown(map.getContainer(), { key: 'ArrowRight' })
    expect(map.getCenter().lng).toBeGreaterThan(before)

    act(() => map.panTo([0, 0], { animate: false }))
    expect(map.getCenter().lat).toBeGreaterThan(12.99)
    expect(map.getCenter().lat).toBeLessThan(13.38)
    expect(map.getCenter().lng).toBeGreaterThan(-59.72)
    expect(map.getCenter().lng).toBeLessThan(-59.36)

    const lucy = screen.getByRole('button', {
      name: 'St. Lucy: 0 current notices',
    })
    fireEvent.focus(lucy)
    expect(map.getBounds().contains([13.31, -59.61])).toBe(true)
  })
})
