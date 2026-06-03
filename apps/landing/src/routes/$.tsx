import { createFileRoute, notFound } from '@tanstack/react-router'
import { Heading, Text, linkVariants } from '@govtech-bb/react'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { HelpfulBox } from '../components/HelpfulBox'
import { MarkdownContent } from '../components/MarkdownContent'
import {
  findPage,
  isPreview,
  isSubPage,
  isVisible,
  PAGES,
  startSubPageInPreview,
} from '../content/registry'
import type { ContentPage } from '../content/registry'
import { CATEGORY_BY_SLUG, getSubcategory } from '../content/categories'
import type { Category, SubCategory } from '../content/categories'
import { getAvailableForms } from '../lib/available-forms'

interface CategoryListItem {
  title: string
  description?: string
  href: string
}

type LoaderData =
  | { kind: 'page'; page: ContentPage; availableForms: string[] }
  | { kind: 'category'; category: Category; items: CategoryListItem[] }
  | {
      kind: 'subcategory-index'
      category: Category
      subcategories: SubCategory[]
    }
  | {
      kind: 'subcategory'
      category: Category
      subcategory: SubCategory
      items: CategoryListItem[]
    }

export const Route = createFileRoute('/$')({
  loader: async ({ params, context }): Promise<LoaderData> => {
    const { preview } = context
    const splat = (params._splat ?? '').replace(/^\/+|\/+$/g, '')
    const segments = splat.split('/').filter(Boolean)

    if (segments.length === 1) {
      const cat = CATEGORY_BY_SLUG[segments[0]]
      if (cat) {
        if (cat.subcategories && cat.subcategories.length > 0) {
          return {
            kind: 'subcategory-index',
            category: cat,
            subcategories: cat.subcategories,
          }
        }
        const items = PAGES.filter(
          (p) =>
            p.frontmatter.categories.includes(cat.slug) &&
            !isSubPage(p) &&
            isVisible(p, preview),
        ).map((p) => ({
          title: p.frontmatter.title,
          description: p.frontmatter.description,
          href: `/${p.url}`,
        }))
        return { kind: 'category', category: cat, items }
      }
    }

    const page = findPage(splat)
    if (page) {
      if (!isVisible(page, preview)) throw notFound()
      // Only content pages render Start now buttons, so the forms list is
      // resolved here (server-side, cached) and nowhere else.
      const availableForms = await getAvailableForms()
      return { kind: 'page', page, availableForms }
    }

    if (segments.length === 2) {
      const cat = CATEGORY_BY_SLUG[segments[0]]
      const sub = cat ? getSubcategory(cat.slug, segments[1]) : undefined
      if (cat && sub) {
        const items = PAGES.filter(
          (p) =>
            p.frontmatter.categories.includes(cat.slug) &&
            p.frontmatter.subcategory === sub.slug &&
            !isSubPage(p) &&
            isVisible(p, preview),
        ).map((p) => ({
          title: p.frontmatter.title,
          description: p.frontmatter.description,
          href: `/${p.url}`,
        }))
        return { kind: 'subcategory', category: cat, subcategory: sub, items }
      }
    }

    throw notFound()
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    if (loaderData.kind === 'page') {
      return {
        meta: [
          { title: loaderData.page.frontmatter.title },
          ...(loaderData.page.frontmatter.description
            ? [
                {
                  name: 'description',
                  content: loaderData.page.frontmatter.description,
                },
              ]
            : []),
          // A preview page only reaches here for a token holder, but keep
          // crawlers out in case the URL is ever shared.
          ...(isPreview(loaderData.page)
            ? [{ name: 'robots', content: 'noindex' }]
            : []),
        ],
      }
    }
    if (loaderData.kind === 'subcategory') {
      return {
        meta: [
          {
            title: `${loaderData.subcategory.title} | ${loaderData.category.title}`,
          },
        ],
      }
    }
    return { meta: [{ title: loaderData.category.title }] }
  },
  component: ContentRoute,
})

function ContentRoute() {
  const data = Route.useLoaderData()
  const { preview } = Route.useRouteContext()
  if (data.kind === 'page')
    return (
      <PageView
        page={data.page}
        availableForms={data.availableForms}
        inPreview={preview}
      />
    )
  if (data.kind === 'subcategory-index')
    return (
      <SubcategoryIndexView
        category={data.category}
        subcategories={data.subcategories}
      />
    )
  if (data.kind === 'subcategory')
    return <SubcategoryView subcategory={data.subcategory} items={data.items} />
  return <CategoryView category={data.category} items={data.items} />
}

function PageView({
  page,
  availableForms,
  inPreview,
}: {
  page: ContentPage
  availableForms: string[]
  inPreview: boolean
}) {
  // A public visitor on a page whose `/start` sub-page is in preview sees the
  // online-application method stripped and the "N ways" count rewritten down.
  const hideStartLink = !inPreview && startSubPageInPreview(page)
  return (
    <Shell>
      {isPreview(page) ? <PreviewBanner /> : null}
      <MarkdownContent
        body={page.body}
        frontmatter={page.frontmatter}
        availableForms={new Set(availableForms)}
        hideStartLink={hideStartLink}
      />
    </Shell>
  )
}

function CategoryView({
  category,
  items,
}: {
  category: Category
  items: CategoryListItem[]
}) {
  const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title))
  return (
    <Shell>
      <div className="space-y-4 lg:space-y-6">
        <Heading as="h1">{category.title}</Heading>
        {category.description ? (
          <Text as="p">{category.description}</Text>
        ) : null}
      </div>
      {sorted.length === 0 ? (
        <Text as="p" className="mt-6 text-mid-grey-00">
          No services yet.
        </Text>
      ) : (
        <div className="mt-6 flex flex-col">
          {sorted.map((item) => (
            <div
              key={item.href}
              className="border-grey-00 border-t-2 py-4 first:border-0 lg:py-8"
            >
              <a
                href={item.href}
                className={`${linkVariants()} text-[20px] leading-normal lg:text-3xl`}
              >
                {item.title}
              </a>
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}

function SubcategoryIndexView({
  category,
  subcategories,
}: {
  category: Category
  subcategories: SubCategory[]
}) {
  return (
    <Shell>
      <div className="space-y-4 lg:space-y-6">
        <Heading as="h1">{category.title}</Heading>
        {category.description ? (
          <Text as="p">{category.description}</Text>
        ) : null}
      </div>
      <ul className="m-0 mt-6 flex list-none flex-col p-0">
        {subcategories.map((sub) => (
          <li
            key={sub.slug}
            className="border-t-2 border-grey-00 py-4 first:border-0 lg:py-8"
          >
            <a
              href={`/${category.slug}/${sub.slug}`}
              className={`${linkVariants()} text-[20px] leading-normal lg:text-3xl`}
            >
              {sub.title}
            </a>
            {sub.description ? (
              <Text as="p" className="mt-1">
                {sub.description}
              </Text>
            ) : null}
          </li>
        ))}
      </ul>
    </Shell>
  )
}

function SubcategoryView({
  subcategory,
  items,
}: {
  subcategory: SubCategory
  items: CategoryListItem[]
}) {
  const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title))
  return (
    <Shell>
      <div className="space-y-4 lg:space-y-6">
        <Heading as="h1">{subcategory.title}</Heading>
        {subcategory.description ? (
          <Text as="p">{subcategory.description}</Text>
        ) : null}
      </div>
      {sorted.length === 0 ? (
        <Text as="p" className="mt-6 text-mid-grey-00">
          No services yet.
        </Text>
      ) : (
        <div className="mt-6 flex flex-col">
          {sorted.map((item) => (
            <div
              key={item.href}
              className="border-grey-00 border-t-2 py-4 first:border-0 lg:py-8"
            >
              <a
                href={item.href}
                className={`${linkVariants()} text-[20px] leading-normal lg:text-3xl`}
              >
                {item.title}
              </a>
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}

/**
 * Shown only to a reviewer in preview mode, and only on a page that is
 * effectively preview — a public visitor never reaches such a page.
 */
function PreviewBanner() {
  return (
    <div
      role="status"
      className="mb-6 border-yellow-40 border-l-4 bg-yellow-10 p-4"
    >
      <Text as="p" className="font-bold">
        Under review — not public
      </Text>
      <Text as="p" size="caption" className="text-mid-grey-00">
        This page is visible to you because you are in preview mode. It is
        hidden from the public and search engines until it is published.
      </Text>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="container py-4 lg:py-6">
        <Breadcrumbs />
      </div>
      <div className="container pt-4 pb-8 lg:py-8">{children}</div>
      <div className="container">
        <HelpfulBox className="mb-4 lg:mb-16" />
      </div>
    </>
  )
}
