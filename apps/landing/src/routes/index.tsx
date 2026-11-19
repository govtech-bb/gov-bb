import { createFileRoute } from '@tanstack/react-router'
import { Heading, Text } from '@govtech-bb/react'
import { Featured } from '../components/Featured'
import { HelpfulBox } from '../components/HelpfulBox'
import { HomeHero, POPULAR_SEARCHES } from '../components/HomeHero'
import { CATEGORIES } from '../content/categories'
import { isCategoryVisible } from '../content/registry'
import type { CategoryTreeResult } from '../lib/api-v2-categories'
import type { ViewLevel } from '../lib/frontmatter'
import {
  getServedChatSuggestions,
  getServedServices,
  publicChatSuggestions,
} from '../lib/chat-suggestions'
import { pageHead } from '../lib/page-head'
import { deriveVisibilityOverlay } from '../lib/service-status'

export const Route = createFileRoute('/')({
  head: () =>
    pageHead(
      'Government Services',
      "Access official Barbados government services online — apply for passports, birth certificates, driver's licences, and more at alpha.gov.bb.",
      { path: '/' },
    ),
  // api_v2 decides which chips and popular searches show when it is
  // configured (#3245). A failed call in the browser shows none rather than
  // an error page.
  loader: async ({ context }) => {
    if (context.categoryTree.kind === 'disabled') {
      const overlay = deriveVisibilityOverlay(context.serviceStatuses)
      return { questions: publicChatSuggestions(overlay) }
    }
    const [questions, servedServices] = await Promise.all([
      getServedChatSuggestions().catch(() => []),
      getServedServices({
        data: POPULAR_SEARCHES.map(({ serviceId }) => serviceId),
      }).catch(() => []),
    ])
    return { questions, servedServices }
  },
  component: Home,
})

interface HomeCategory {
  href: string
  title: string
  description?: string | null
}

/**
 * The categories the home page lists: api_v2's when it is configured, else the
 * static taxonomy. Null when api_v2 can't say. The static list
 * would bring back categories an editor removed.
 */
function homeCategories(
  tree: CategoryTreeResult,
  level: ViewLevel,
  overlay: ReturnType<typeof deriveVisibilityOverlay>,
): HomeCategory[] | null {
  switch (tree.kind) {
    case 'disabled':
      return CATEGORIES.filter((cat) =>
        isCategoryVisible(cat, level, overlay),
      ).map((cat) => ({
        href: `/${cat.slug}`,
        title: cat.title,
        description: cat.description,
      }))
    case 'found':
      return tree.categories.map((cat) => ({
        href: cat.url,
        title: cat.title,
        description: cat.description,
      }))
    default:
      return null
  }
}

function Home() {
  const { level, serviceStatuses, categoryTree } = Route.useRouteContext()
  const overlay = deriveVisibilityOverlay(serviceStatuses)
  const { questions, servedServices } = Route.useLoaderData()
  const categories = homeCategories(categoryTree, level, overlay)

  return (
    <>
      <HomeHero
        questions={questions}
        viewer={level}
        overlay={overlay}
        servedServices={servedServices}
      />

      <section>
        <div className="govbb-width-container">
          {/*
            Two columns from lg, stacking below it with services first.

            The gap steps up at xl. 128px all the way down to lg squeezed the
            Featured column to 245px at a 1024 viewport, leaving 173px for the
            descriptions — four lines each; 64px keeps them to three. From xl it
            widens to 128px, which reproduces the design's 1256 = 752 + 128 + 376
            at the 1512 frame width.

            xl (1280) rather than a min-[1512px] query: a 1512 *viewport* is only
            ~1497 CSS px once the scrollbar is taken off, so a 1512 breakpoint
            never matches at the width the design is drawn for.
          */}
          <div className="py-m lg:grid lg:grid-cols-[2fr_1fr] lg:gap-x-l lg:py-l xl:gap-x-xl">
            <div className="space-y-m">
              <Heading as="h2">All government services</Heading>
              {categories === null ? (
                <Text as="p">
                  We can't show the service categories right now.{' '}
                  <a href="/services" className="govbb-link">
                    Browse all services A to Z
                  </a>
                  .
                </Text>
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {categories.map((cat) => (
                    <li
                      key={cat.href}
                      className="border-neutral border-b-2 py-s lg:py-xm [--govbb-link-color:var(--govbb-color-tertiary)]"
                    >
                      <a
                        href={cat.href}
                        className="govbb-link govbb-text-body-lg govbb-text-bold"
                      >
                        {cat.title}
                      </a>
                      {cat.description ? (
                        <Text as="p" className="mt-xxs">
                          {cat.description}
                        </Text>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-l lg:mt-0">
              <Featured />
            </div>
          </div>
        </div>
      </section>

      <div className="govbb-width-container">
        <HelpfulBox className="mb-s lg:mb-l" />
      </div>
    </>
  )
}
