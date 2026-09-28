import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { Footer, FooterLink, SkipLink } from '@govtech-bb/react'
import Header from '../components/Header'
import { ErrorPage } from '../components/ErrorPage'
import { ServerErrorPage } from '../components/ServerErrorPage'
import { SITE_URL } from '../lib/site-url'
import { buildOrganizationLd } from '../lib/structured-data'

import appCss from '../styles.css?url'

const FOOTER_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Terms & Conditions', href: '/terms-conditions' },
  {
    label: 'Careers',
    href: 'https://job-boards.greenhouse.io/govtechbarbados',
  },
]

export const Route = createRootRoute({
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
      ]}
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
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
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
