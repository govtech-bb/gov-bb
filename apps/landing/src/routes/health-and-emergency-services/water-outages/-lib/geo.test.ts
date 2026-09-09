import { afterEach, describe, expect, it, vi } from 'vitest'
import { locateParish, parishAt } from './geo'

afterEach(() => {
  vi.doUnmock('./parish-boundaries.json')
  vi.resetModules()
})

describe('water parish lookup', () => {
  it('uses boundaries on land, limits coastal estimates, and rejects distant or invalid positions', async () => {
    await expect(locateParish(13.1, -59.61)).resolves.toEqual({
      value: 'saint-michael',
      exact: true,
    })
    await expect(locateParish(13.04, -59.54)).resolves.toEqual({
      value: 'christ-church',
      exact: false,
    })
    await expect(locateParish(51.5, -0.1)).resolves.toBeNull()
    await expect(locateParish(Number.NaN, -59.61)).resolves.toBeNull()
    await expect(
      locateParish(13.1, Number.POSITIVE_INFINITY),
    ).resolves.toBeNull()
  })

  it('respects polygon holes and disjoint parish polygons', () => {
    const boundaries = {
      parish: {
        type: 'MultiPolygon' as const,
        coordinates: [
          [
            [
              [0, 0],
              [4, 0],
              [4, 4],
              [0, 4],
            ],
            [
              [1, 1],
              [2, 1],
              [2, 2],
              [1, 2],
            ],
          ],
          [
            [
              [10, 10],
              [12, 10],
              [12, 12],
              [10, 12],
            ],
          ],
        ],
      },
    }
    expect(parishAt(0.5, 0.5, boundaries)).toBe('parish')
    expect(parishAt(1.5, 1.5, boundaries)).toBeNull()
    expect(parishAt(11, 11, boundaries)).toBe('parish')
  })

  it('returns a failure when boundary data cannot load', async () => {
    vi.doMock('./parish-boundaries.json', () => {
      throw new Error('chunk unavailable')
    })
    const { locateParish: locate } = await import('./geo')
    await expect(locate(13.1, -59.61)).resolves.toBeNull()
  })
})
