import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
} from '@tanstack/react-router'
import { Footer, textVariants } from '@govtech-bb/react'
import Header from '../components/Header'
import { ErrorPage } from '../components/ErrorPage'
import { trackEvent } from '../lib/analytics'
import { resolveViewLevel } from '../lib/preview'
import { getServiceStatuses } from '../lib/service-status'
import { SITE_URL } from '../lib/site-url'

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
  // Resolve the viewer's content level and the runtime service statuses once,
  // server-side, and expose them on the router context so every child
  // loader/component can gate on them. Runs on the initial SSR load; the
  // resolved values ride the dehydrated context across subsequent client
  // navigations, so there's no per-navigation server round-trip. `serviceStatuses`
  // is a plain `[slug, status]` array (seroval-serialisable); consumers derive
  // the visibility overlay / form-disabled set from it (see `service-status.ts`).
  beforeLoad: async () => {
    const { level, redirectTo } = await resolveViewLevel()
    if (redirectTo) throw redirect({ href: redirectTo })
    const serviceStatuses = await getServiceStatuses()
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
    scripts: UMAMI_WEBSITE_ID
      ? [
          {
            src: UMAMI_SRC,
            defer: true,
            'data-website-id': UMAMI_WEBSITE_ID,
            'data-auto-track': 'false',
          },
        ]
      : undefined,
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
      <body>
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
    <div
      className={`${textVariants({ size: 'body' })} grid min-h-screen grid-rows-[auto_1fr_auto] font-sans antialiased text-black-00 bg-white-00 print:block print:min-h-0 print:h-auto`}
    >
      <div className="print:hidden">
        <Header />
      </div>
      <main id="main">
        <Outlet />
      </main>
      <div className="print:hidden">
        <Footer
          links={FOOTER_LINKS}
          logoSrc="/images/coat-of-arms.png"
          logoAlt="Barbados Coat of Arms"
          copyrightText={`© ${new Date().getFullYear()} Government of Barbados`}
        />
      </div>
    </div>
  )
}
