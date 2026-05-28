import { createFileRoute, notFound } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Heading, Text, linkVariants } from '@govtech-bb/react'
import { PageShell } from '../components/PageShell'
import { LexicalContent } from '../components/LexicalContent'
import { findPage } from '../content/registry'
import type { ContentPage } from '../content/registry'
import {
  categoriesQueryOptions,
  cmsRouteHeaders,
  servicesByCategoryQueryOptions,
  servicesBySubcategoryQueryOptions,
  subcategoriesByCategoryQueryOptions,
  type CmsCategory,
  type CmsServiceListItem,
  type CmsSubcategory,
} from '../lib/cms'

type LoaderData =
  | { kind: 'page'; page: ContentPage }
  | { kind: 'category'; category: CmsCategory; categorySlug: string }
  | { kind: 'subcategory-index'; category: CmsCategory; categorySlug: string }
  | {
      kind: 'subcategory'
      category: CmsCategory
      subcategory: CmsSubcategory
      categorySlug: string
      subcategorySlug: string
    }

export const Route = createFileRoute('/$')({
  // Cache header applies to CMS-fed routes; static page (kind 'page') paths
  // also benefit from CDN caching since they don't change between deploys.
  // On error we send no-store so an outage page isn't pinned for 5 minutes
  // after the CMS recovers.
  headers: ({ match }) => cmsRouteHeaders(match.status),
  loader: async ({ params, context }): Promise<LoaderData> => {
    const splat = (params._splat ?? '').replace(/^\/+|\/+$/g, '')
    const segments = splat.split('/').filter(Boolean)
    const { queryClient } = context

    // Try CMS routing first. If the CMS is unreachable, we still want static
    // service pages to render (kind 'page' from findPage); a true notFound is
    // only correct when we *know* the CMS has no match for this URL.
    let categories: CmsCategory[] | null = null
    let cmsUp = true
    try {
      categories = await queryClient.ensureQueryData(categoriesQueryOptions())
    } catch {
      cmsUp = false
    }

    if (categories && segments.length === 1) {
      const cat = categories.find((c) => c.slug === segments[0])
      if (cat) {
        // Fetch subs and services in parallel; the unused result is wasted
        // only for the 1-of-8 category that has subcategories.
        const [subs] = await Promise.all([
          queryClient.ensureQueryData(subcategoriesByCategoryQueryOptions(cat.slug)),
          queryClient.ensureQueryData(servicesByCategoryQueryOptions(cat.slug)),
        ])
        if (subs.length > 0) {
          return { kind: 'subcategory-index', category: cat, categorySlug: cat.slug }
        }
        return { kind: 'category', category: cat, categorySlug: cat.slug }
      }
    }

    if (categories && segments.length === 2) {
      const cat = categories.find((c) => c.slug === segments[0])
      if (cat) {
        // Speculatively fetch services for the URL-provided sub-slug in
        // parallel with subs-list validation. If the URL is a typo, the
        // services fetch is wasted (404 path) — acceptable trade for
        // halving the happy-path waterfall.
        const [subs] = await Promise.all([
          queryClient.ensureQueryData(subcategoriesByCategoryQueryOptions(cat.slug)),
          queryClient.ensureQueryData(
            servicesBySubcategoryQueryOptions(cat.slug, segments[1]),
          ),
        ])
        const sub = subs.find((s) => s.slug === segments[1])
        if (sub) {
          return {
            kind: 'subcategory',
            category: cat,
            subcategory: sub,
            categorySlug: cat.slug,
            subcategorySlug: sub.slug,
          }
        }
      }
    }

    const page = findPage(splat)
    if (page) return { kind: 'page', page }

    // Distinguish "page genuinely missing" from "CMS unreachable so we can't
    // tell" — only the former is a notFound; the latter falls through to
    // errorComponent so the citizen sees "temporarily unavailable" rather
    // than "page not found" on a URL that may exist.
    if (!cmsUp) throw new Error('CMS unreachable; cannot resolve URL')
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
  errorComponent: ContentError,
  component: ContentRoute,
})

function ContentRoute() {
  const data = Route.useLoaderData()
  if (data.kind === 'page') return <PageView page={data.page} />
  if (data.kind === 'subcategory-index')
    return <SubcategoryIndexView category={data.category} categorySlug={data.categorySlug} />
  if (data.kind === 'subcategory')
    return (
      <SubcategoryView
        category={data.category}
        subcategory={data.subcategory}
        categorySlug={data.categorySlug}
        subcategorySlug={data.subcategorySlug}
      />
    )
  return <CategoryView category={data.category} categorySlug={data.categorySlug} />
}

function PageView({ page }: { page: ContentPage }) {
  return (
    <PageShell>
      <LexicalContent body={page.body} frontmatter={page.frontmatter} />
    </PageShell>
  )
}

function ServiceList({ items }: { items: CmsServiceListItem[] }) {
  if (items.length === 0) {
    return (
      <Text as="p" className="mt-6 text-mid-grey-00">
        No services yet.
      </Text>
    )
  }
  return (
    <div className="mt-6 flex flex-col">
      {items.map((item) => (
        <div
          key={item.url}
          className="border-grey-00 border-t-2 py-4 first:border-0 lg:py-8"
        >
          <a
            href={`/${item.url}`}
            className={`${linkVariants()} text-[20px] leading-normal lg:text-3xl`}
          >
            {item.title}
          </a>
        </div>
      ))}
    </div>
  )
}

function CategoryView({
  category,
  categorySlug,
}: {
  category: CmsCategory
  categorySlug: string
}) {
  const { data: items } = useSuspenseQuery(servicesByCategoryQueryOptions(categorySlug))
  return (
    <PageShell>
      <div className="space-y-4 lg:space-y-6">
        <Heading as="h1">{category.title}</Heading>
        {category.description ? <Text as="p">{category.description}</Text> : null}
      </div>
      <ServiceList items={items} />
    </PageShell>
  )
}

function SubcategoryIndexView({
  category,
  categorySlug,
}: {
  category: CmsCategory
  categorySlug: string
}) {
  const { data: subcategories } = useSuspenseQuery(
    subcategoriesByCategoryQueryOptions(categorySlug),
  )
  return (
    <PageShell>
      <div className="space-y-4 lg:space-y-6">
        <Heading as="h1">{category.title}</Heading>
        {category.description ? <Text as="p">{category.description}</Text> : null}
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
    </PageShell>
  )
}

function SubcategoryView({
  subcategory,
  categorySlug,
  subcategorySlug,
}: {
  category: CmsCategory
  subcategory: CmsSubcategory
  categorySlug: string
  subcategorySlug: string
}) {
  const { data: items } = useSuspenseQuery(
    servicesBySubcategoryQueryOptions(categorySlug, subcategorySlug),
  )
  return (
    <PageShell>
      <div className="space-y-4 lg:space-y-6">
        <Heading as="h1">{subcategory.title}</Heading>
        {subcategory.description ? <Text as="p">{subcategory.description}</Text> : null}
      </div>
      <ServiceList items={items} />
    </PageShell>
  )
}

function ContentError() {
  return (
    <PageShell>
      <Heading as="h1">Service list temporarily unavailable</Heading>
      <Text as="p" className="mt-4 text-mid-grey-00">
        We can&apos;t load this page right now. Please try again shortly. The
        rest of the site still works.
      </Text>
    </PageShell>
  )
}
