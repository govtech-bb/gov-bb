import { describe, expect, it } from 'vitest'
import { freshnessLabel, isPast } from './outages'
import type { Outage } from './outages'

const now = Date.parse('2026-06-23T16:00:00Z')
const notice: Outage = {
  id: 'repair',
  title: 'Station continues to experience technical problems',
  link: 'https://barbadoswaterauthority.com/notice',
  published: new Date(now).toISOString(),
  summary: '',
  parishes: ['saint-john'],
  type: 'repair',
}

describe('notice age', () => {
  it.each([
    { endsAt: '2026-06-22T16:00:00Z' },
    { eventDay: '2026-06-22' },
    { published: '2026-06-19T16:00:00Z' },
  ])('labels older notices without claiming restoration: %o', (dates) => {
    const older = { ...notice, ...dates }
    expect(isPast(older, now)).toBe(true)
    expect(freshnessLabel(older, now)).toBe('Older notice')
  })

  it('keeps today and tomorrow distinct from older notices', () => {
    expect(freshnessLabel(notice, now)).toBe('Today')
    expect(freshnessLabel({ ...notice, eventDay: '2026-06-24' }, now)).toBe(
      'Tomorrow',
    )
  })
})
