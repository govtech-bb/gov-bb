import { describe, expect, it } from 'vitest'
import { search } from './search'

describe('search', () => {
  it('finds a service by name', () => {
    const hrefs = search('death certificate').map((h) => h.href)
    expect(hrefs).toContain('/family-birth-relationships/get-death-certificate')
  })

  it('does not surface a service step page (e.g. /start) as its own result', () => {
    const hrefs = search('death certificate').map((h) => h.href)
    expect(hrefs.some((h) => h.endsWith('/start'))).toBe(false)
  })
})
