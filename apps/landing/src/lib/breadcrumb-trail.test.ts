import { describe, expect, it } from 'vitest'
import { ancestorTrail, sitePath } from './breadcrumb-trail'
import type { CategoryTreeResult } from './api-v2-categories'

const HEALTH = {
  slug: 'health-and-emergency-services',
  url: '/health-and-emergency-services',
  title: 'Health (renamed in the editor)',
  description: null,
}

const found = (
  categories: Array<typeof HEALTH & { subcategories: Array<typeof HEALTH> }>,
): CategoryTreeResult => ({ kind: 'found', categories })

describe('ancestorTrail', () => {
  const FINDER = '/health-and-emergency-services/find-an-open-pharmacy/find'

  it('labels categories from the static taxonomy when api_v2 is off', () => {
    expect(ancestorTrail(FINDER, { kind: 'disabled' })).toEqual([
      {
        name: 'Health and emergency services',
        url: '/health-and-emergency-services',
      },
      {
        name: 'Find a pharmacy and check what Barbados Drug Service benefits it offers',
        url: '/health-and-emergency-services/find-an-open-pharmacy',
      },
    ])
  })

  it("labels an app route's category from api_v2, keeping its page label", () => {
    expect(
      ancestorTrail(FINDER, found([{ ...HEALTH, subcategories: [] }])),
    ).toEqual([
      { name: 'Health (renamed in the editor)', url: HEALTH.url },
      {
        name: 'Find a pharmacy and check what Barbados Drug Service benefits it offers',
        url: '/health-and-emergency-services/find-an-open-pharmacy',
      },
    ])
  })

  it.each([
    ['the tree does not list it', found([])],
    ['the tree is unavailable', { kind: 'unavailable' } as const],
    ['the tree is malformed', { kind: 'malformed' } as const],
  ])('leaves the category out, never the static name, when %s', (_, tree) => {
    expect(ancestorTrail(FINDER, tree)).toEqual([
      {
        name: 'Find a pharmacy and check what Barbados Drug Service benefits it offers',
        url: '/health-and-emergency-services/find-an-open-pharmacy',
      },
    ])
  })

  it('labels a subcategory from api_v2 and leaves out one it does not list', () => {
    const sub = {
      slug: 'youth-development-leadership',
      url: '/youth-and-community/youth-development-leadership',
      title: 'Leadership (api_v2)',
      description: null,
    }

    const youth = {
      ...HEALTH,
      slug: 'youth-and-community',
      url: '/youth-and-community',
      title: 'Youth (api_v2)',
    }

    const path = '/youth-and-community/youth-development-leadership/a-page'
    expect(
      ancestorTrail(path, found([{ ...youth, subcategories: [sub] }])),
    ).toEqual([
      { name: 'Youth (api_v2)', url: '/youth-and-community' },
      { name: 'Leadership (api_v2)', url: sub.url },
    ])
    expect(
      ancestorTrail(path, found([{ ...youth, subcategories: [] }])),
    ).toEqual([{ name: 'Youth (api_v2)', url: '/youth-and-community' }])
  })
})

describe('sitePath', () => {
  it.each([
    ['/a/b', '/a/b'],
    ['a/b', '/a/b'],
    ['//a', '/a'],
  ])('%s → %s', (url, path) => {
    expect(sitePath(url)).toBe(path)
  })
})
