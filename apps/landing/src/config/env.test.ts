import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireEnv } from './env'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('requireEnv', () => {
  it('returns the configured value, trimmed', () => {
    expect(
      requireEnv('  https://forms.alpha.gov.bb  ', 'VITE_FORMS_URL', 'dev'),
    ).toBe('https://forms.alpha.gov.bb')
  })

  it('falls back to the dev default when unset in a dev build', () => {
    vi.stubEnv('DEV', true)
    expect(requireEnv(undefined, 'VITE_FORMS_URL', 'https://dev')).toBe(
      'https://dev',
    )
    expect(requireEnv('', 'VITE_FORMS_URL', 'https://dev')).toBe('https://dev')
    expect(requireEnv('   ', 'VITE_FORMS_URL', 'https://dev')).toBe(
      'https://dev',
    )
  })

  it('throws (fails fast) when unset in a production build', () => {
    vi.stubEnv('DEV', false)
    expect(() =>
      requireEnv(undefined, 'VITE_FORMS_URL', 'https://dev'),
    ).toThrow(/VITE_FORMS_URL/)
    expect(() => requireEnv('  ', 'VITE_FORMS_URL', 'https://dev')).toThrow()
  })

  it('returns the value even in production when it is set', () => {
    vi.stubEnv('DEV', false)
    expect(
      requireEnv('https://forms.alpha.gov.bb', 'VITE_FORMS_URL', 'dev'),
    ).toBe('https://forms.alpha.gov.bb')
  })
})
