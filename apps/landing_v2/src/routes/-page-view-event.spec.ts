import { describe, expect, it } from 'vitest'
import { pageViewEvent } from './-page-view-event'

const baseFrontmatter = { title: 'X', categories: ['work-employment'] }

describe('pageViewEvent', () => {
  it('returns page-start-view for a /start sub-page', () => {
    const e = pageViewEvent({
      url: 'work-employment/x/start',
      frontmatter: { ...baseFrontmatter, form_id: 'x' },
    } as never)
    expect(e).toEqual({
      name: 'page-start-view',
      data: { form: 'x', category: 'work-employment' },
    })
  })

  it('returns page-service-view for a normal service page', () => {
    const e = pageViewEvent({
      url: 'work-employment/x',
      frontmatter: { ...baseFrontmatter, form_id: 'x' },
    } as never)
    expect(e).toEqual({
      name: 'page-service-view',
      data: { form: 'x', category: 'work-employment' },
    })
  })

  it('returns null when the page links no form', () => {
    expect(
      pageViewEvent({
        url: 'work-employment/x',
        frontmatter: baseFrontmatter,
      } as never),
    ).toBeNull()
  })

  it('falls back to "uncategorised" when the page has no category', () => {
    const e = pageViewEvent({
      url: 'x',
      frontmatter: { title: 'X', categories: [], form_id: 'x' },
    } as never)
    expect(e).toEqual({
      name: 'page-service-view',
      data: { form: 'x', category: 'uncategorised' },
    })
  })
})
