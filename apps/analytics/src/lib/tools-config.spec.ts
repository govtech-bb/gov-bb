import { describe, expect, it } from 'vitest'
import { liveTools, pathMatchesPrefix } from './tools-config'

describe('liveTools', () => {
  it('lists every tool once, by the ID its events carry', () => {
    expect(
      liveTools()
        .map((t) => t.id)
        .sort(),
    ).toEqual([
      'bank-holidays',
      'crop-over-permits',
      'nis-self-employed',
      'pension-calculator',
      'pharmacy-finder',
      'severance-calculator',
      'shelter-finder',
      'water-outages',
    ])
  })

  it('gives each tool an entry page under its own prefix', () => {
    for (const t of liveTools()) {
      expect(pathMatchesPrefix(t.primaryPath, t.prefix)).toBe(true)
    }
  })
})
