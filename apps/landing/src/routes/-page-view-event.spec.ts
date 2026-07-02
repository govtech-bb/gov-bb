import { describe, expect, it } from 'vitest'
import { pageViewEvent } from './-page-view-event'

const base = {
  url: 'work-employment/x',
  frontmatter: { title: 'X', categories: ['work-employment'] },
}

describe('pageViewEvent', () => {
  it('returns page-start-view for a /start sub-page', () => {
    const e = pageViewEvent({
      ...base,
      slug: 'x/start',
      frontmatter: { ...base.frontmatter, form_id: 'x' },
    } as never)
    expect(e).toEqual({
      name: 'page-start-view',
      data: { form: 'x', category: 'work-employment' },
    })
  })
  it('returns page-service-view for a normal service page', () => {
    const e = pageViewEvent({
      ...base,
      slug: 'x',
      frontmatter: { ...base.frontmatter, form_id: 'x' },
    } as never)
    expect(e).toEqual({
      name: 'page-service-view',
      data: { form: 'x', category: 'work-employment' },
    })
  })
  it('returns null when the page links no form', () => {
    expect(
      pageViewEvent({
        ...base,
        slug: 'x',
        frontmatter: base.frontmatter,
      } as never),
    ).toBeNull()
  })
})
