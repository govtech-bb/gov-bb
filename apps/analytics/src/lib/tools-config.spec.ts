import { describe, expect, it } from 'vitest'
import { liveTools } from './tools-config'

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
})
