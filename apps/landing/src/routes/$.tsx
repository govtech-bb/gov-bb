import { createFileRoute, notFound } from '@tanstack/react-router'
import { Heading, Text, linkVariants } from '@govtech-bb/react'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { HelpfulBox } from '../components/HelpfulBox'
import { MarkdownContent } from '../components/MarkdownContent'
import { findPage, PAGES  } from '../content/registry'
import type {ContentPage} from '../content/registry';
import { CATEGORY_BY_SLUG, getSubcategory } from '../content/categories'
import type {Category, SubCategory} from '../content/categories';

interface CategoryListItem {
  title: string
  description?: string
  href: string
}

type LoaderData =
  | { kind: 'page'; page: ContentPage }
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
  loader: ({ params, context }): LoaderData => {
    const previewMode = context.previewMode
    const splat = (params._splat ?? '').replace(/^\/+|\/+$/g, '')
    const segments = splat.split('/').filter(Boolean)
    const isVisible = (p: ContentPage) =>
      previewMode || !p.frontmatter.draft

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
          (p) => p.frontmatter.categories.includes(cat.slug) && isVisible(p),
        ).map((p) => ({
          title: p.frontmatter.title,
          description: p.frontmatter.description,
          href: `/${p.url}`,
        }))
        return { kind: 'category', category: cat, items }
      }
    }

    const page = findPage(splat)
    if (page && isVisible(page)) return { kind: 'page', page }

    if (segments.length === 2) {
      const cat = CATEGORY_BY_SLUG[segments[0]]
      const sub = cat ? getSubcategory(cat.slug, segments[1]) : undefined
      if (cat && sub) {
        const items = PAGES.filter(
          (p) =>
            p.frontmatter.categories.includes(cat.slug) &&
            p.frontmatter.subcategory === sub.slug &&
            isVisible(p),
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
  const { previewMode } = Route.useRouteContext()
  if (data.kind === 'page')
    return <PageView page={data.page} previewMode={previewMode} />
  if (data.kind === 'subcategory-index')
    return (
      <SubcategoryIndexView
        category={data.category}
        subcategories={data.subcategories}
      />
    )
  if (data.kind === 'subcategory')
    return (
      <SubcategoryView subcategory={data.subcategory} items={data.items} />
    )
  return <CategoryView category={data.category} items={data.items} />
}

function PageView({
  page,
  previewMode,
}: {
  page: ContentPage
  previewMode: boolean
}) {
  return (
    <Shell>
      <MarkdownContent
        body={page.body}
        frontmatter={page.frontmatter}
        previewMode={previewMode}
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
