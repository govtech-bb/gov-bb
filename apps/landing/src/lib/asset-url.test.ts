import { describe, expect, it } from 'vitest'
import { assetUrl } from './asset-url'

describe('assetUrl', () => {
  it('keeps the root-relative path on the public site', () => {
    expect(assetUrl('/images/govbb-crest.svg')).toBe('/images/govbb-crest.svg')
  })

  it('resolves against the asset origin in the CMS preview', () => {
    expect(assetUrl('/images/govbb-crest.svg', 'https://alpha.gov.bb')).toBe(
      'https://alpha.gov.bb/images/govbb-crest.svg',
    )
  })
})
