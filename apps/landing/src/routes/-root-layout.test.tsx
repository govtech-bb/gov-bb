/**
 * @vitest-environment jsdom
 */
import { QueryClient } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CATEGORY_BY_SLUG, isCategoryVisible } from '../content/registry'
import type { CategoryNode, CategoryTreeResult } from '../lib/api-v2-categories'
import type { ViewLevel } from '../lib/frontmatter'
import { Route } from './__root'

afterEach(cleanup)

/**
 * The real root route at `/`, its context already fresh in the query cache.
 * React's empty href warning comes from the root's stylesheet link: Vitest
 * doesn't build CSS, so `styles.css?url` is empty.
 */
async function renderRoot(level: ViewLevel, categoryTree: CategoryTreeResult) {
  const queryClient = new QueryClient()
  // Fresh root queries, so beforeLoad reads them instead of calling the server.
  queryClient.setQueryData(['root', 'view-level'], level)
  queryClient.setQueryData(['root', 'service-statuses'], [])
  queryClient.setQueryData(['root', 'category-tree'], categoryTree)

  const router = createRouter({
    routeTree: Route,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  // The root's shell is the whole document, so it mounts on the document.
  render(<RouterProvider router={router} />, { container: document })
  await screen.findAllByRole('link', { name: 'Services' })
}

const aboutBarbadosHrefs = () =>
  screen
    .queryAllByRole('link', { name: 'About Barbados' })
    .map((link) => link.getAttribute('href'))

const category = (slug: string, title: string): CategoryNode => ({
  slug,
  url: `/${slug}`,
  title,
  description: null,
  subcategories: [],
})

describe('the header About Barbados link', () => {
  it('shows when the public api_v2 tree lists the category', async () => {
    // A public viewer: the tree decides, not the static category's pages.
    await renderRoot('public', {
      kind: 'found',
      categories: [category('about-barbados', 'About Barbados')],
    })

    expect(aboutBarbadosHrefs()).toEqual(['/about-barbados'])
  })

  // A reviewer, who can see the static category: only the tree may hide it.
  it.each([
    [
      'does not list it',
      {
        kind: 'found',
        categories: [category('business-trade', 'Business and trade')],
      },
    ],
    ['is unavailable', { kind: 'unavailable' }],
    ['is malformed', { kind: 'malformed' }],
  ] satisfies Array<[string, CategoryTreeResult]>)(
    'is hidden when the api_v2 tree %s',
    async (_, tree) => {
      await renderRoot('preview', tree)

      expect(aboutBarbadosHrefs()).toEqual([])
    },
  )

  it.each(['public', 'preview'] as const)(
    'follows the static category for a %s viewer when api_v2 is off',
    async (level) => {
      await renderRoot(level, { kind: 'disabled' })

      expect(aboutBarbadosHrefs()).toEqual(
        isCategoryVisible(CATEGORY_BY_SLUG['about-barbados'], level)
          ? ['/about-barbados']
          : [],
      )
    },
  )
})
