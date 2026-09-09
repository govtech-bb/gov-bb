import { describe, expect, it } from 'vitest'
import { FrontmatterSchema } from './frontmatter'
import type { ViewLevel } from './frontmatter'
import { normalizeSearchQuery, search, suggest } from './search'

describe('search metadata', () => {
  it('trims aliases and rejects blank entries', () => {
    expect(FrontmatterSchema.parse({ keywords: ['  NIS  '] }).keywords).toEqual(
      ['NIS'],
    )
    expect(FrontmatterSchema.safeParse({ keywords: ['   '] }).success).toBe(
      false,
    )
  })
})

describe('query normalization', () => {
  it('normalizes case, punctuation, apostrophes and repeated whitespace', () => {
    expect(normalizeSearchQuery('  Driver’s   LICENSE!!! ')).toBe(
      'driver licence',
    )
  })

  it('normalizes only reviewed American spellings and word forms', () => {
    expect(
      normalizeSearchQuery('prescription COLORS and home care programs'),
    ).toBe('prescription colours home care programmes')
  })

  it('removes question scaffolding and returns an empty query when none remains', () => {
    expect(normalizeSearchQuery('where can I get a government service')).toBe(
      '',
    )
  })
})

describe('full search', () => {
  it('prefers an exact title phrase', () => {
    expect(search('death certificate')[0]?.href).toBe(
      '/family-birth-relationships/get-death-certificate',
    )
  })

  it('uses a controlled fallback for extra natural-language terms', () => {
    expect(
      search('I lost my death certificate and need another copy')[0]?.href,
    ).toBe('/family-birth-relationships/get-death-certificate')
  })

  it('does not relax to a result with only one matching term', () => {
    expect(search('renew passport', 'preview')).toEqual([])
    expect(search('fishing licence', 'preview')).toEqual([])
  })

  it('rejects a single incidental description match', () => {
    expect(search('BRA', 'preview')).toEqual([])
  })

  it('allows explicit service aliases', () => {
    expect(search('redundancy pay')[0]?.href).toBe(
      '/money-financial-support/calculate-severance-pay',
    )
  })

  it('does not let body content establish relevance', () => {
    expect(search('photocopies', 'preview')).toEqual([])
    expect(search('passport', 'preview')).toEqual([])
  })

  it('still uses a multi-term description match', () => {
    expect(search('mail redirection').map((hit) => hit.href)).toContain(
      '/travel-id-citizenship/post-office-redirection-individual',
    )
  })

  it('supports safe final-word prefixes and one-edit misspellings', () => {
    expect(search('birth certif')[0]?.href).toBe(
      '/family-birth-relationships/get-birth-certificate',
    )
    expect(search('birth certficate')[0]?.href).toBe(
      '/family-birth-relationships/get-birth-certificate',
    )
  })

  it('does not fuzzy-match or prefix-match very short terms', () => {
    expect(search('ce')).toEqual([])
  })

  it('keeps step pages out of results', () => {
    expect(
      search('death certificate').some((hit) => hit.href.endsWith('/start')),
    ).toBe(false)
  })

  it('includes application-level service metadata', () => {
    expect(search('birth certificate')[0]?.digital).toBe(true)
    expect(search('prescription colours', 'preview')[0]?.digital).toBe(false)
  })

  it('preserves frontmatter and overlay visibility', () => {
    expect(search('open pharmacy')).toEqual([])

    const overlay = new Map<string, ViewLevel>([
      ['get-death-certificate', 'preview'],
    ])
    expect(search('death certificate', 'public', overlay)).toEqual([])
    expect(search('death certificate', 'preview', overlay)[0]?.href).toBe(
      '/family-birth-relationships/get-death-certificate',
    )
  })
})

describe('autocomplete', () => {
  it('waits for three trimmed characters', () => {
    expect(suggest(' ab ')).toEqual([])
  })

  it('matches a literal official-title prefix made only from stop words', () => {
    const results = suggest('Get a')

    expect(results.length).toBeGreaterThan(0)
    expect(results.every((result) => result.title.startsWith('Get a'))).toBe(
      true,
    )
  })

  it('matches title-word prefixes and genuine misspellings', () => {
    const certificateSuggestions = suggest('certif')
    expect(certificateSuggestions.length).toBeGreaterThan(0)
    expect(
      certificateSuggestions.every((hit) =>
        hit.title.toLowerCase().includes('certificate'),
      ),
    ).toBe(true)
    expect(suggest('birth certif')[0]?.href).toBe(
      '/family-birth-relationships/get-birth-certificate',
    )
    expect(suggest('birth certficate')[0]?.href).toBe(
      '/family-birth-relationships/get-birth-certificate',
    )
  })

  it('uses aliases and visibility without description or body matches', () => {
    expect(suggest('open chemist')).toEqual([])
    expect(suggest('open chemist', 'preview')[0]?.href).toBe(
      '/health-and-emergency-services/find-an-open-pharmacy',
    )
    expect(suggest('BRA', 'preview')).toEqual([])
    expect(suggest('photocopies', 'preview')).toEqual([])
  })

  it('does not use the relaxed full-search fallback', () => {
    expect(suggest('lost death certificate another copy', 'preview')).toEqual(
      [],
    )
  })

  it('returns at most five services', () => {
    expect(suggest('apply')).toHaveLength(5)
  })

  it('does not suggest a missing service from a partial word', () => {
    expect(suggest('passp', 'preview')).toEqual([])
  })
})
