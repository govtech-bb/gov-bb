import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
} from '@tanstack/react-router'
import { Footer, FooterLink, SkipLink } from '@govtech-bb/react'
import { BreadcrumbRegion } from '../components/BreadcrumbRegion'
import Header from '../components/Header'
import { ErrorPage } from '../components/ErrorPage'
import { trackEvent } from '../lib/analytics'
import { COOKIE_MAX_AGE_SECONDS, resolveViewLevel } from '../lib/preview'
import { getServiceStatuses } from '../lib/service-status'
import { SITE_URL } from '../lib/site-url'
import { buildOrganizationLd, buildWebSiteLd } from '../lib/structured-data'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

const FOOTER_LINKS = [
  { label: 'Home', href: '/', onClick: () => trackEvent('footer-home') },
  {
    label: 'Terms & Conditions',
    href: '/terms-conditions',
    onClick: () => trackEvent('footer-terms'),
  },
  {
    label: 'Careers',
    href: 'https://job-boards.greenhouse.io/govtechbarbados',
    onClick: () => trackEvent('footer-careers'),
  },
]

interface MyRouterContext {
  queryClient: QueryClient
}

// Query keys + freshness for the root context values resolved in `beforeLoad`.
// Kept module-level so the keys are defined once and can't drift.
const ROOT_VIEW_LEVEL_QUERY_KEY = ['root', 'view-level'] as const
const ROOT_SERVICE_STATUSES_QUERY_KEY = ['root', 'service-statuses'] as const
/** 60s, matching the server-side cache in `service-status.ts`. */
const ROOT_SERVICE_STATUSES_STALE_MS = 60_000
// Cap the view-level cache at the grant cookie's own lifetime (derived from
// preview.ts, not hardcoded, so the two can't drift). Without a cap, a reviewer
// who leaves a tab open past the 4h cookie expiry would keep seeing
// preview/draft content client-side after the grant has lapsed server-side.
const ROOT_VIEW_LEVEL_STALE_MS = COOKIE_MAX_AGE_SECONDS * 1000

// Umami analytics. The website id is a `VITE_`-prefixed var, so Vite inlines it
// at build time from the build-container env (`import.meta.env`) — no runtime
// env needed, which is what makes it work on Amplify (the SSR compute never
// sees Console env vars; see vite.config.ts for the server-only PREVIEW_SECRET
// equivalent). The id is public — it ships in the rendered <script> tag — so it
// must NOT be read via the server-only runtime config the way PREVIEW_SECRET is.
// When the id is unset the script is omitted entirely, so no events are sent.
const UMAMI_WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID as
  | string
  | undefined
const UMAMI_SRC =
  (import.meta.env.VITE_UMAMI_SRC as string | undefined) ??
  'https://cloud.umami.is/script.js'

export const Route = createRootRouteWithContext<MyRouterContext>()({
  // Resolve the viewer's content level and the runtime service statuses and
  // expose them on the router context so every child loader/component can gate
  // on them. `serviceStatuses` is a plain `[slug, status]` array
  // (seroval-serialisable); consumers derive the visibility overlay /
  // form-disabled set from it (see `service-status.ts`).
  //
  // Both values come from a `createServerFn`. The router re-runs the root
  // match's `beforeLoad` on every navigation, so calling them directly each
  // time costs a per-navigation server round-trip (#2307). Instead we resolve
  // them through the router's TanStack Query client: `ensureQueryData` fetches
  // once, the SSR result is dehydrated into the document and hydrated on the
  // client (`setupRouterSsrQueryIntegration` in router.tsx), and subsequent
  // navigations read the cached value with no round-trip — including the first
  // client navigation, which reads the hydrated value rather than refetching.
  //
  // Isolation: the QueryClient is created per `getRouter()` call — one per
  // request on the server, one per session on the client — so a viewer's
  // `preview`/`draft` grant is never shared across requests. The view-level
  // cache is capped at the grant cookie's lifetime (see below) rather than held
  // forever, so an expired grant can't linger in a long-open tab.
  //
  // A `?preview=`/`?draft=` token bypasses the cache entirely: the grant is
  // changing, so it must resolve fresh and run its cookie + redirect
  // side-effects, and must never be cached under the shared query key.
  beforeLoad: async ({ context, location }) => {
    const search = location.search as Record<string, unknown>
    if (search.preview !== undefined || search.draft !== undefined) {
      const { level, redirectTo } = await resolveViewLevel()
      if (redirectTo) throw redirect({ href: redirectTo })
      const serviceStatuses = await getServiceStatuses()
      return { level, serviceStatuses }
    }

    const { queryClient } = context
    const [level, serviceStatuses] = await Promise.all([
      // The grant only changes via a token (handled above, with a full
      // redirect), so within a document it's effectively fixed — but it's capped
      // at the cookie's lifetime so an expired grant can't linger in a tab left
      // open past 4h.
      queryClient.ensureQueryData({
        queryKey: ROOT_VIEW_LEVEL_QUERY_KEY,
        queryFn: async () => (await resolveViewLevel()).level,
        staleTime: ROOT_VIEW_LEVEL_STALE_MS,
        gcTime: ROOT_VIEW_LEVEL_STALE_MS,
      }),
      // Mirrors the 60s server-side cache in service-status.ts: an already-open
      // tab picks up an admin toggle within 60s, or on reload.
      queryClient.ensureQueryData({
        queryKey: ROOT_SERVICE_STATUSES_QUERY_KEY,
        queryFn: getServiceStatuses,
        staleTime: ROOT_SERVICE_STATUSES_STALE_MS,
        gcTime: ROOT_SERVICE_STATUSES_STALE_MS,
      }),
    ])
    return { level, serviceStatuses }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Government Services | Government of Barbados' },
      { name: 'theme-color', content: '#000000' },
      // Open Graph / Twitter defaults. Per-page routes override the title,
      // description and url (via `pageHead`); these site-wide values aren't
      // worth repeating per page.
      { property: 'og:site_name', content: 'Government of Barbados' },
      { property: 'og:locale', content: 'en_BB' },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: `${SITE_URL}/og-image.png` },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: `${SITE_URL}/og-image.png` },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.json' },
    ],
    scripts: [
      // Site-wide structured data — present on every page (#1643).
      {
        type: 'application/ld+json',
        children: JSON.stringify(buildOrganizationLd()),
      },
      {
        type: 'application/ld+json',
        children: JSON.stringify(buildWebSiteLd()),
      },
      ...(UMAMI_WEBSITE_ID
        ? [
            {
              src: UMAMI_SRC,
              defer: true,
              'data-website-id': UMAMI_WEBSITE_ID,
              'data-auto-track': 'false',
            },
          ]
        : []),
    ],
  }),
  notFoundComponent: NotFoundPage,
  errorComponent: ServerErrorPage,
  component: RootLayout,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="govbb-page print:block print:min-h-0">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function NotFoundPage() {
  return (
    <ErrorPage
      title="We couldn't find that page"
      intro="The page you're looking for may have been moved, removed, or the address may have been typed incorrectly."
      suggestions={[
        'Check the web address for typos',
        'Return to the homepage',
        'Browse our services directory',
      ]}
      secondary={{ label: 'Browse our service directory', href: '/services' }}
      primary={{ label: 'Return to homepage', href: '/' }}
    />
  )
}

function ServerErrorPage() {
  return (
    <ErrorPage
      title="Something went wrong on our end"
      intro={
        <>
          We're experiencing a technical problem. This isn't your fault. Our
          team has been notified and is working to fix it.
        </>
      }
      suggestions={[
        'Refresh the page and try again',
        'Return to the homepage',
        'Try again in a few minutes',
        'Contact us if the problem continues',
      ]}
      secondary={{ label: 'Contact us', href: '/feedback' }}
      primary={{ label: 'Return to homepage', href: '/' }}
    />
  )
}

function RootLayout() {
  return (
    <>
      <SkipLink href="#main-content" />
      <div className="print:hidden">
        <Header />
      </div>
      <BreadcrumbRegion>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </BreadcrumbRegion>
      <Footer
        className="print:hidden"
        coatSrc="/images/coat-of-arms.png"
        copy={`© ${new Date().getFullYear()} Government of Barbados`}
      >
        {FOOTER_LINKS.map(({ label, ...link }) => (
          <FooterLink key={label} {...link}>
            {label}
          </FooterLink>
        ))}
      </Footer>
    </>
  )
}
