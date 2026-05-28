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
import { resolveFlag } from '../lib/flag'

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
  flag: boolean
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async () => {
    // Resolve the feature-flag cookie/token once per request. The result is
    // exposed on router context so every loader can branch (CMS queries
    // include or exclude `flag: 'flagged'` docs accordingly).
    const { flag, redirectTo } = await resolveFlag()
    if (redirectTo) {
      throw redirect({ to: redirectTo, reloadDocument: true })
    }
    return { flag }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Government Services | Government of Barbados' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
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
      secondary={{ label: 'Contact us', href: '/contact' }}
      primary={{ label: 'Return to homepage', href: '/' }}
    />
  )
}

function RootLayout() {
  return (
    <div
      className={`${textVariants({ size: 'body' })} grid min-h-screen grid-rows-[auto_1fr_auto] font-sans antialiased text-black-00 bg-white-00`}
    >
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer
        links={FOOTER_LINKS}
        logoSrc="/images/coat-of-arms.png"
        logoAlt="Barbados Coat of Arms"
        copyrightText={`© ${new Date().getFullYear()} Government of Barbados`}
      />
    </div>
  )
}
