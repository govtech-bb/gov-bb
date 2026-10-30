import { useEffect } from 'react'
import type { RootContent } from 'hast'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { Heading, StatusBanner, Text } from '@govtech-bb/react'
import { HelpfulBox } from '../components/HelpfulBox'
import { MarkdownContent } from '../components/markdown'
import {
  categoryServices,
  findPage,
  isCategoryVisible,
  isStartSubPageVisible,
  isVisible,
  pageLevel,
  resolveBareSlugRedirect,
} from '../content/registry'
import type { ContentPage } from '../content/registry'
import type { ViewLevel } from '../lib/frontmatter'
import { CATEGORY_BY_SLUG, getSubcategory } from '../content/categories'
import type { Category, SubCategory } from '../content/categories'
import {
  getAvailableForms,
  getMaintenanceForms,
  getClosedForms,
} from '../lib/available-forms'
import {
  deriveFormDisabledSlugs,
  deriveVisibilityOverlay,
} from '../lib/service-status'
import { shouldHideStartLink } from '../lib/hide-start-link'
import { checkFormAccessible } from '../lib/preview-form-access'
import { contentSource, getApiV2Page } from '../lib/api-v2-page'
import type { ContentSource, SerializedContentPage } from '../lib/api-v2-page'
import {
  getApiV2CategoryListing,
  resolveCategoryAddress,
} from '../lib/api-v2-categories'
import type { CategoryListing } from '../lib/api-v2-categories'
import { ancestorTrail, sitePath } from '../lib/breadcrumb-trail'
import type { Crumb } from '../lib/breadcrumb-trail'
import { seoTags } from '../lib/page-head'
import {
  buildGovernmentServiceLd,
  buildBreadcrumbLd,
  ldJsonScriptText,
} from '../lib/structured-data'
import { trackEvent } from '../lib/analytics'
import { pageViewEvent } from './-page-view-event'

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
  | {
      // A static page sends only its URL across the loader→client
      // serialization boundary; the full page (incl. its component function,
      // which seroval can't serialize) is re-resolved from the registry — a
      // module constant on both sides — at render time. An api_v2 page (#2944)
      // isn't in the registry, so it sends the page itself.
      kind: 'page'
      url: string
      page?: SerializedContentPage
      availableForms: string[]
      underMaintenance: boolean
      /** Whether the form's application window has closed (#1936) — for the
       * closed notice and hiding the online application method. */
      applicationClosed: boolean
      /** The page's effective level (with the status overlay) — for the review
       * banner and `noindex`. */
      level: ViewLevel
      /** Whether the viewer may see the `/start` step — for hiding the online
       * application method. Precomputed here so the component needs no overlay. */
      startSubPageVisible: boolean
      /** Sent as `x-content-source` (contract in api-v2-page.ts). */
      source: ContentSource
      /** api_v2 mode only: the whole trail, this page last and Home left out,
       * shared by the visible breadcrumbs and their JSON-LD. */
      breadcrumbs?: Crumb[]
    }
  | {
      // api_v2 mode (ADR 0078): a category's own pages and its subcategories,
      // both shown, as api_v2 lists them.
      kind: 'api-category'
      listing: CategoryListing
      breadcrumbs: Crumb[]
    }
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
  staticData: { breadcrumbMode: 'location' },
  loader: async ({ params, context }): Promise<LoaderData> => {
    const { level, serviceStatuses } = context
    // The runtime service_status overlay overrides frontmatter visibility per
    // slug (`disabled` → hidden from the public, `enabled` → published).
    const overlay = deriveVisibilityOverlay(serviceStatuses)
    const splat = (params._splat ?? '').replace(/^\/+|\/+$/g, '')
    const segments = splat.split('/').filter(Boolean)

    // A known category's failed listing is an error. Without a readable tree,
    // the address may instead be a page; preserve page fallback, never a
    // static category listing (ADR 0078).
    const tree = context.categoryTree
    const apiMode = tree.kind !== 'disabled'
    let categoryFailure: Error | undefined

    if (tree.kind !== 'disabled') {
      const address = await resolveCategoryAddress(segments, tree, (path) =>
        getApiV2CategoryListing({ data: path }),
      )

      if (address.kind === 'listing') {
        const { category, parent } = address.listing

        return {
          kind: 'api-category',
          listing: address.listing,
          breadcrumbs: [...(parent ? [parent] : []), category].map((ref) => ({
            name: ref.title,
            url: sitePath(ref.url),
          })),
        }
      }

      if (address.kind !== 'not_category') {
        categoryFailure = new Error(
          `Category listing ${address.kind} for /${splat}`,
        )
        if (tree.kind === 'found') throw categoryFailure
      }
    }

    if (!apiMode && segments.length === 1) {
      const cat = CATEGORY_BY_SLUG[segments[0]]
      if (cat) {
        if (!isCategoryVisible(cat, level, overlay)) throw notFound()
        if (cat.subcategories && cat.subcategories.length > 0) {
          return {
            kind: 'subcategory-index',
            category: cat,
            subcategories: cat.subcategories,
          }
        }
        const items = categoryServices(cat.slug, level, overlay).map(toListItem)
        return { kind: 'category', category: cat, items }
      }
    }

    // api_v2 first (#2944): it serves only public pages, so a miss (or no
    // api_v2 configured) falls back to the static registry page. A known
    // subcategory listing is never an api_v2 page, so it skips the round
    // trip (#2950); `findPage` still runs first, keeping today's precedence.
    // Unset VITE_API_V2_URL skips it too (#3127), so client navigations make
    // no server-fn call. The value is build-baked into both bundles, so the
    // server fn's runtime process.env fallback no longer matters here.
    const isSubcategory =
      !apiMode &&
      segments.length === 2 &&
      CATEGORY_BY_SLUG[segments[0]] !== undefined &&
      getSubcategory(segments[0], segments[1]) !== undefined
    const v2 =
      isSubcategory || !import.meta.env.VITE_API_V2_URL
        ? ({ kind: 'miss', reason: 'skipped' } as const)
        : await getApiV2Page({ data: `/${splat}` })
    if (v2.kind === 'redirect') throw redirect({ href: v2.to, statusCode: 301 })
    const v2Page = v2.kind === 'page' ? v2.page : undefined
    const page = v2Page ?? findPage(splat)
    if (page) {
      // api_v2 already enforced visibility. A service_status row never changes
      // an api_v2 page's: content_pages.visibility is the only page-level switch
      // in v2 (#3125); #3248 decides what replaces the feature_flagging page
      // toggles. The form-level state below still applies.
      if (!v2Page && !isVisible(page, level, overlay)) throw notFound()
      // Only content pages render Start now buttons, so the forms list is
      // resolved here (server-side, cached) and nowhere else.
      let availableForms = await getAvailableForms()
      // Reviewers may reach linked or explicitly referenced non-public forms.
      // Confirm each missing target under the preview token without mutating
      // the shared public-forms cache (#1646 Phase 3).
      const formId = page.frontmatter.form_id
      if (level !== 'public') {
        const targets = new Set(formId ? [formId] : [])
        const collectTargets = (nodes: RootContent[]) => {
          for (const node of nodes) {
            if (node.type !== 'element') continue
            if (
              node.tagName === 'a' &&
              node.properties.dataStartLink !== undefined &&
              node.properties.href === undefined &&
              typeof node.properties.dataFormId === 'string'
            )
              targets.add(node.properties.dataFormId)
            collectTargets(node.children)
          }
        }
        collectTargets(page.hast.children)
        for (const target of targets) {
          if (
            !availableForms.includes(target) &&
            (await checkFormAccessible({ data: target }))
          )
            availableForms = [...availableForms, target]
        }
      }
      // A `form_disabled` service_status forces the service's form into the
      // maintenance path: for the public its Start button is hidden and its
      // `/start` step 404s (removed from the available list); a reviewer keeps
      // token-accessible forms added above. Status rows use canonical form ids;
      // filter every target, not just this page's linked form.
      const disabledFormIds = deriveFormDisabledSlugs(serviceStatuses)
      const formDisabledByStatus =
        formId !== undefined && disabledFormIds.has(formId)
      if (level === 'public') {
        availableForms = availableForms.filter((id) => !disabledFormIds.has(id))
      }
      // A closed form (#1936) stays public, so — unlike maintenance — it IS in
      // availableForms; strip every closed target before the `/start` gate.
      // Only the page’s own form determines its closed notice.
      const closedForms = new Set(await getClosedForms())
      const applicationClosed = formId !== undefined && closedForms.has(formId)
      availableForms = availableForms.filter((id) => !closedForms.has(id))
      // The `/start` sub-page IS the online-application step. When its form is
      // non-public (preview/maintenance/status-disabled) it is hidden the same
      // way its Start button is — a reviewer keeps access (the form was added to
      // availableForms above); otherwise the step stays reachable by direct URL.
      if (
        page.slug.endsWith('/start') &&
        formId !== undefined &&
        !availableForms.includes(formId)
      ) {
        throw notFound()
      }
      // A maintenance recipe is non-public, so it never appears in the available
      // list above; landing learns it is *specifically* under maintenance (vs
      // merely unpublished) from the dedicated endpoint, to render the notice. A
      // `form_disabled` status renders the same notice.
      const underMaintenance =
        formDisabledByStatus ||
        (formId ? (await getMaintenanceForms()).includes(formId) : false)
      return {
        kind: 'page',
        url: page.url,
        availableForms,
        underMaintenance,
        applicationClosed,
        level: v2Page ? 'public' : pageLevel(page, overlay),
        startSubPageVisible: v2Page
          ? !v2Page.hideStartLinks
          : isStartSubPageVisible(page, level, overlay),
        page: v2Page,
        source: contentSource(v2),
        ...(apiMode && {
          breadcrumbs: v2Page
            ? v2Page.breadcrumbs.map((crumb) => ({
                name: crumb.name,
                url: sitePath(crumb.url),
              }))
            : [
                ...ancestorTrail(page.url, tree),
                { name: page.frontmatter.title, url: `/${page.url}` },
              ],
        }),
      }
    }

    if (categoryFailure) throw categoryFailure

    if (!apiMode && segments.length === 2) {
      const cat = CATEGORY_BY_SLUG[segments[0]]
      const sub = cat ? getSubcategory(cat.slug, segments[1]) : undefined
      if (cat && sub) {
        if (!isCategoryVisible(cat, level, overlay)) throw notFound()
        const items = categoryServices(cat.slug, level, overlay)
          .filter((p) => p.frontmatter.subcategory === sub.slug)
          .map(toListItem)
        return { kind: 'subcategory', category: cat, subcategory: sub, items }
      }
    }

    // Before 404ing, try the bare slug: an intuitive URL like
    // `/get-marriage-certificate` should land on the page that exists at its
    // canonical category-prefixed URL rather than a dead end (#2145). Gated
    // pages and ambiguous/unknown slugs resolve to undefined and fall through
    // to the 404 below.
    const redirectTo = resolveBareSlugRedirect(splat, level, overlay)
    if (redirectTo) {
      throw redirect({ href: `/${redirectTo}`, statusCode: 301 })
    }

    throw notFound()
  },
  // On the SSR document response, unlike setResponseHeader in a server fn.
  headers: ({ loaderData }) =>
    loaderData
      ? {
          'x-content-source':
            loaderData.kind === 'page'
              ? loaderData.source
              : loaderData.kind === 'api-category'
                ? 'api_v2'
                : 'static',
        }
      : undefined,
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    if (loaderData.kind === 'page') {
      const page = loaderData.page ?? findPage(loaderData.url)
      if (!page) return {}
      const title = page.frontmatter.title
      const isPublic = loaderData.level === 'public'
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
        // Structured data only for indexable pages — a gated page is noindex,
        // so it gets no JSON-LD (mirrors the canonical/OG gating above).
        ...(isPublic
          ? {
              scripts: [
                {
                  type: 'application/ld+json',
                  children: ldJsonScriptText(buildGovernmentServiceLd(page)),
                },
                {
                  type: 'application/ld+json',
                  children: ldJsonScriptText(
                    buildBreadcrumbLd(page, loaderData.breadcrumbs),
                  ),
                },
              ],
            }
          : {}),
      }
    }

    if (loaderData.kind === 'api-category') {
      const { category, parent } = loaderData.listing

      const title = parent
        ? `${category.title} | ${parent.title}`
        : category.title

      const seo = seoTags(
        title,
        category.description ?? '',
        sitePath(category.url),
      )

      return { meta: [{ title }, ...seo.meta], links: seo.links }
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
  if (data.kind === 'page') {
    const page = data.page ?? findPage(data.url)
    if (!page) throw notFound()
    return (
      <PageView
        page={page}
        availableForms={data.availableForms}
        level={data.level}
        startSubPageVisible={data.startSubPageVisible}
        underMaintenance={data.underMaintenance}
        applicationClosed={data.applicationClosed}
      />
    )
  }

  if (data.kind === 'api-category') {
    const { category, subcategories, pages } = data.listing

    const services = pages.map((page) => ({
      title: page.title,
      href: sitePath(page.url),
    }))

    return (
      <Shell>
        <PageHeader
          title={category.title}
          description={category.description ?? undefined}
        />
        {subcategories.length === 0 ? (
          // Services only: the service listing, as a static category shows it.
          <ServiceList items={services} />
        ) : (
          // Subcategories (with descriptions) then services A to Z, in one
          // list so every row after the first gets the listing's divider.
          <ListingLinks
            items={[
              ...subcategories.map((sub) => ({
                title: sub.title,
                description: sub.description ?? undefined,
                href: sitePath(sub.url),
              })),
              ...services.sort((a, b) => a.title.localeCompare(b.title)),
            ]}
          />
        )}
      </Shell>
    )
  }
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
  level,
  startSubPageVisible,
  underMaintenance,
  applicationClosed,
}: {
  page: ContentPage
  availableForms: string[]
  /** The page's effective level (with the status overlay), for the banner. */
  level: ViewLevel
  /** Whether the viewer may see the `/start` step (computed in the loader). */
  startSubPageVisible: boolean
  underMaintenance: boolean
  applicationClosed: boolean
}) {
  // A visitor whose level can't see this page's `/start` sub-page (because it's
  // gated above them) sees the online-application method stripped and the
  // "N ways" count rewritten down. Any non-public recipe — `preview`, `draft`,
  // or `maintenance` — is absent from `availableForms`, so it hides the same way
  // for the public; a reviewer keeps the Start button (the loader adds a
  // token-accessible form back to the list) so they can still test it.
  // `maintenance` differs only in also rendering the notice (below).
  useEffect(() => {
    const event = pageViewEvent(page)
    if (event) trackEvent(event.name, event.data)
  }, [page])
  const hideStartLink = shouldHideStartLink({
    startSubPageVisible,
    formId: page.frontmatter.form_id,
    availableForms,
  })
  // A co-located `.tsx` page renders its own title/layout; everything else is
  // a `.md` page rendered through the markdown article chrome.
  const Body = page.selfRendered ? page.Component : undefined
  return (
    <Shell>
      {level !== 'public' ? <ReviewBanner level={level} /> : null}
      {underMaintenance ? (
        <StatusBanner variant="service" className="mb-s" rounded>
          <p>
            This form is currently being upgraded to serve you better. Please
            check back soon.
          </p>
        </StatusBanner>
      ) : null}
      {applicationClosed ? (
        <StatusBanner variant="service" className="mb-s" rounded>
          <p>Applications for this service have closed.</p>
        </StatusBanner>
      ) : null}
      {Body ? (
        <Body />
      ) : (
        <MarkdownContent
          hast={page.hast}
          frontmatter={page.frontmatter}
          availableForms={new Set(availableForms)}
          hideStartLink={hideStartLink}
        />
      )}
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
  return (
    <Shell>
      <PageHeader title={title} description={description} />
      <ServiceList items={items} />
    </Shell>
  )
}

/** A listing's services, A to Z, one link each. */
function ServiceList({ items }: { items: CategoryListItem[] }) {
  const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title))

  return (
    <>
      {sorted.length === 0 ? (
        <Text as="p" className="mt-6 text-grey-70">
          No services yet.
        </Text>
      ) : (
        <div className="mt-6 flex flex-col">
          {sorted.map((item) => (
            <div
              key={item.href}
              className="border-grey-20 border-t-2 py-4 first:border-0 lg:py-8"
            >
              <a
                href={item.href}
                className="govbb-link text-body leading-normal lg:text-3xl"
              >
                {item.title}
              </a>
            </div>
          ))}
        </div>
      )}
    </>
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
      <ListingLinks
        items={subcategories.map((sub) => ({
          title: sub.title,
          description: sub.description,
          href: `/${category.slug}/${sub.slug}`,
        }))}
      />
    </Shell>
  )
}

/**
 * A category's rows, in the given order, each with its description if it has
 * one: the subcategories of a static category, or an api_v2 category's
 * subcategories and services together.
 */
function ListingLinks({ items }: { items: CategoryListItem[] }) {
  return (
    <ul className="m-0 mt-6 flex list-none flex-col p-0">
      {items.map((sub) => (
        <li
          key={sub.href}
          className="border-t-2 border-grey-20 py-4 first:border-0 lg:py-8"
        >
          <a
            href={sub.href}
            className="govbb-link text-body leading-normal lg:text-3xl"
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
      className="mb-6 border-yellow-20 border-l-4 bg-yellow-10 p-4"
    >
      <Text as="p" className="font-bold">
        {copy.heading}
      </Text>
      <Text as="p" size="body-sm" className="text-grey-70">
        {copy.detail}
      </Text>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="govbb-width-container govbb-main-wrapper">{children}</div>
      <div className="govbb-width-container print:hidden">
        <HelpfulBox className="mb-4 lg:mb-16" />
      </div>
    </>
  )
}
