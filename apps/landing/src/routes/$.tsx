import { createFileRoute, notFound } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Heading, Text, linkVariants } from '@govtech-bb/react'
import type { SerializedEditorState } from 'lexical'
import { ErrorPage } from '../components/ErrorPage'
import { PageShell } from '../components/PageShell'
import { LexicalContent } from '../components/LexicalContent'
import { findPage } from '../content/registry'
import type { ContentPage } from '../content/registry'
import {
  categoriesQueryOptions,
  cmsRouteHeaders,
  serviceByUrlQueryOptions,
  serviceFlagStatusByUrlQueryOptions,
  servicesByCategoryQueryOptions,
  servicesBySubcategoryQueryOptions,
  subcategoriesByCategoryQueryOptions,
  type CmsCategory,
  type CmsService,
  type CmsServiceListItem,
  type CmsSubcategory,
} from '../lib/cms'
import { markFlaggedResponse } from '../lib/flag'
import type { Frontmatter } from '../lib/frontmatter'

interface RenderablePage {
  frontmatter: Frontmatter
  body: SerializedEditorState
}

type LoaderData =
  | { kind: 'page'; page: RenderablePage }
  | { kind: 'flagged' }
  | { kind: 'category'; category: CmsCategory; categorySlug: string }
  | { kind: 'subcategory-index'; category: CmsCategory; categorySlug: string }
  | {
      kind: 'subcategory'
      category: CmsCategory
      subcategory: CmsSubcategory
      categorySlug: string
      subcategorySlug: string
    }

function cmsToRenderable(svc: CmsService): RenderablePage {
  return {
    frontmatter: {
      title: svc.title,
      description: svc.description,
      categories: svc.categories,
      subcategory: svc.subcategory,
      updated_at: svc.updatedAt ? new Date(svc.updatedAt) : undefined,
      source_url: svc.sourceUrl,
      stage: svc.stage,
      start_type: svc.startType,
      form_id: svc.formId,
      start_url: svc.startUrl,
      is_start_page: svc.isStartPage,
      // Entry page that has a start page → its Start now button links to
      // <current path>/start; otherwise (the start page itself, or a digital
      // service with no start content) the button goes straight to the action.
      has_start_page: !svc.isStartPage && svc.hasStartPage ? true : undefined,
    },
    body: svc.body,
  }
}

function staticToRenderable(page: ContentPage): RenderablePage {
  return { frontmatter: page.frontmatter, body: page.body }
}

export const Route = createFileRoute('/$')({
  // Cache header applies to CMS-fed routes; static page (kind 'page') paths
  // also benefit from CDN caching since they don't change between deploys.
  // On error we send no-store so an outage page isn't pinned for 5 minutes
  // after the CMS recovers. A flagged page (503) is also no-store so that
  // unflagging takes effect without CDN propagation lag.
  headers: ({ match, loaderData }) =>
    loaderData?.kind === 'flagged'
      ? { 'Cache-Control': 'no-store, max-age=0' }
      : cmsRouteHeaders(match.status),
  loader: async ({ params, context }): Promise<LoaderData> => {
    const splat = (params._splat ?? '').replace(/^\/+|\/+$/g, '')
    const segments = splat.split('/').filter(Boolean)
    const { queryClient, flag } = context

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
          queryClient.ensureQueryData(servicesByCategoryQueryOptions(cat.slug, flag)),
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
            servicesBySubcategoryQueryOptions(cat.slug, segments[1], flag),
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

    // Service body pages: ask the CMS. If it answers cleanly (success), trust
    // the answer — a missing/unpublished doc means the page is genuinely
    // gone, and we 404 instead of falling back to the stale static JSON.
    // If the CMS query *fails* (it threw — outage), fall back to the static
    // file so existing pages keep rendering during an outage.
    let serviceQueryOk = false
    if (cmsUp) {
      try {
        const svc = await queryClient.ensureQueryData(
          serviceByUrlQueryOptions(splat, flag),
        )
        serviceQueryOk = true
        if (svc) return { kind: 'page', page: cmsToRenderable(svc) }
      } catch {
        // Outage on this query — leave serviceQueryOk false to fall through.
      }
    }

    if (!cmsUp || !serviceQueryOk) {
      const page = findPage(splat)
      if (page) return { kind: 'page', page: staticToRenderable(page) }
      // Couldn't reach the CMS and no static page either — surface an outage
      // message rather than a misleading 404.
      throw new Error('CMS unreachable; cannot resolve URL')
    }

    // CMS answered with no visible doc. Before we 404, check if there's a
    // published-but-flagged doc at this URL — that case is 503 (intentionally
    // hidden behind a feature flag) rather than 404 (genuinely missing).
    // Skip the check when the viewer already has the reviewer flag — their
    // first query already included flagged docs, so a null means missing.
    if (!flag) {
      const status = await queryClient.ensureQueryData(
        serviceFlagStatusByUrlQueryOptions(splat),
      )
      if (status === 'flagged') {
        await markFlaggedResponse()
        return { kind: 'flagged' }
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
    if (loaderData.kind === 'flagged') {
      return { meta: [{ title: "This page isn't available yet" }] }
    }
    return { meta: [{ title: loaderData.category.title }] }
  },
  errorComponent: ContentError,
  component: ContentRoute,
})

function ContentRoute() {
  const data = Route.useLoaderData()
  if (data.kind === 'page') return <PageView page={data.page} />
  if (data.kind === 'flagged') return <FlaggedView />
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

function FlaggedView() {
  return (
    <ErrorPage
      title="This service is temporarily unavailable"
      intro="We're performing scheduled maintenance or experiencing unusually high traffic. This service should be back shortly."
      suggestions={[
        'Try again in a few minutes',
        'Return to the homepage to access other services',
      ]}
      primary={{ label: 'Return to homepage', href: '/' }}
    />
  )
}

function PageView({ page }: { page: RenderablePage }) {
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
  const { flag } = Route.useRouteContext()
  const { data: items } = useSuspenseQuery(
    servicesByCategoryQueryOptions(categorySlug, flag),
  )
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
  const { flag } = Route.useRouteContext()
  const { data: items } = useSuspenseQuery(
    servicesBySubcategoryQueryOptions(categorySlug, subcategorySlug, flag),
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
