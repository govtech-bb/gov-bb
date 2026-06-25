import { createFileRoute, notFound } from '@tanstack/react-router'
import { Heading, Text, linkVariants } from '@govtech-bb/react'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { HelpfulBox } from '../components/HelpfulBox'
import { MarkdownContent } from '../components/markdown'
import {
  categoryServices,
  findPage,
  isCategoryVisible,
  isStartSubPageVisible,
  isVisible,
  pageLevel,
} from '../content/registry'
import type { ContentPage } from '../content/registry'
import type { ViewLevel } from '../lib/frontmatter'
import { CATEGORY_BY_SLUG, getSubcategory } from '../content/categories'
import type { Category, SubCategory } from '../content/categories'
import { getAvailableForms } from '../lib/available-forms'
import { seoTags } from '../lib/page-head'

interface CategoryListItem {
  title: string
  description?: string
  href: string
}

const toListItem = (p: ContentPage): CategoryListItem => ({
  title: p.frontmatter.title,
  description: p.frontmatter.description,
  href: `/${p.url}`,
})

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
    const { level } = context
    const splat = (params._splat ?? '').replace(/^\/+|\/+$/g, '')
    const segments = splat.split('/').filter(Boolean)

    if (segments.length === 1) {
      const cat = CATEGORY_BY_SLUG[segments[0]]
      if (cat) {
        if (!isCategoryVisible(cat, level)) throw notFound()
        if (cat.subcategories && cat.subcategories.length > 0) {
          return {
            kind: 'subcategory-index',
            category: cat,
            subcategories: cat.subcategories,
          }
        }
        const items = categoryServices(cat.slug, level).map(toListItem)
        return { kind: 'category', category: cat, items }
      }
    }

    const page = findPage(splat)
    if (page) {
      if (!isVisible(page, level)) throw notFound()
      // Only content pages render Start now buttons, so the forms list is
      // resolved here (server-side, cached) and nowhere else.
      const availableForms = await getAvailableForms()
      return { kind: 'page', page, availableForms }
    }

    if (segments.length === 2) {
      const cat = CATEGORY_BY_SLUG[segments[0]]
      const sub = cat ? getSubcategory(cat.slug, segments[1]) : undefined
      if (cat && sub) {
        if (!isCategoryVisible(cat, level)) throw notFound()
        const items = categoryServices(cat.slug, level)
          .filter((p) => p.frontmatter.subcategory === sub.slug)
          .map(toListItem)
        return { kind: 'subcategory', category: cat, subcategory: sub, items }
      }
    }

    throw notFound()
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    if (loaderData.kind === 'page') {
      const { page } = loaderData
      const title = page.frontmatter.title
      const isPublic = pageLevel(page) === 'public'
      // Canonical/OG only for indexable pages — a gated page is noindex.
      const seo = isPublic
        ? seoTags(title, page.frontmatter.description ?? '', `/${page.url}`)
        : undefined
      return {
        meta: [
          { title },
          ...(page.frontmatter.description
            ? [{ name: 'description', content: page.frontmatter.description }]
            : []),
          // A gated page only reaches here for a token holder, but keep
          // crawlers out in case the URL is ever shared.
          ...(isPublic ? [] : [{ name: 'robots', content: 'noindex' }]),
          ...(seo?.meta ?? []),
        ],
        ...(seo ? { links: seo.links } : {}),
      }
    }
    if (loaderData.kind === 'subcategory') {
      const { category, subcategory } = loaderData
      const title = `${subcategory.title} | ${category.title}`
      const seo = seoTags(
        title,
        subcategory.description ?? '',
        `/${category.slug}/${subcategory.slug}`,
      )
      return { meta: [{ title }, ...seo.meta], links: seo.links }
    }
    const { category } = loaderData
    const seo = seoTags(
      category.title,
      category.description ?? '',
      `/${category.slug}`,
    )
    return { meta: [{ title: category.title }, ...seo.meta], links: seo.links }
  },
  component: ContentRoute,
})

function ContentRoute() {
  const data = Route.useLoaderData()
  const { level } = Route.useRouteContext()
  if (data.kind === 'page')
    return (
      <PageView
        page={data.page}
        availableForms={data.availableForms}
        viewerLevel={level}
      />
    )
  if (data.kind === 'subcategory-index')
    return (
      <SubcategoryIndexView
        category={data.category}
        subcategories={data.subcategories}
      />
    )
  // `category` and `subcategory` are the same listing; they differ only in
  // which heading the page carries.
  const heading = data.kind === 'subcategory' ? data.subcategory : data.category
  return (
    <ServiceListView
      title={heading.title}
      description={heading.description}
      items={data.items}
    />
  )
}

function PageView({
  page,
  availableForms,
  viewerLevel,
}: {
  page: ContentPage
  availableForms: string[]
  viewerLevel: ViewLevel
}) {
  // A visitor whose level can't see this page's `/start` sub-page (because it's
  // gated above them) sees the online-application method stripped and the
  // "N ways" count rewritten down.
  const hideStartLink = !isStartSubPageVisible(page, viewerLevel)
  const level = pageLevel(page)
  return (
    <Shell>
      {level !== 'public' ? <ReviewBanner level={level} /> : null}
      <MarkdownContent
        hast={page.hast}
        frontmatter={page.frontmatter}
        availableForms={new Set(availableForms)}
        hideStartLink={hideStartLink}
      />
    </Shell>
  )
}

function PageHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="space-y-4 lg:space-y-6">
      <Heading as="h1">{title}</Heading>
      {description ? <Text as="p">{description}</Text> : null}
    </div>
  )
}

/** A category or sub-category page: a heading and its alphabetised services. */
function ServiceListView({
  title,
  description,
  items,
}: {
  title: string
  description?: string
  items: CategoryListItem[]
}) {
  const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title))
  return (
    <Shell>
      <PageHeader title={title} description={description} />
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
      <PageHeader title={category.title} description={category.description} />
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

/**
 * Shown only to a reviewer whose grant lets them see a gated page — a public
 * visitor never reaches one. The copy names the level so a reviewer knows
 * whether they're seeing `preview` content (visible to preview + draft tokens)
 * or `draft` content (visible to the draft token only).
 */
function ReviewBanner({ level }: { level: Exclude<ViewLevel, 'public'> }) {
  const copy = {
    preview: {
      heading: 'Under review — not public',
      detail:
        'This page is visible to you because you are in preview mode. It is hidden from the public and search engines until it is published.',
    },
    draft: {
      heading: 'Draft — hidden from preview',
      detail:
        'This page is visible to you because you are in draft mode. It is hidden from the public, from preview reviewers, and from search engines until it is published.',
    },
  }[level]
  return (
    <div
      role="status"
      className="mb-6 border-yellow-40 border-l-4 bg-yellow-10 p-4"
    >
      <Text as="p" className="font-bold">
        {copy.heading}
      </Text>
      <Text as="p" size="caption" className="text-mid-grey-00">
        {copy.detail}
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
