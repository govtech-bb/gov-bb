import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { Footer, textVariants } from '@govtech-bb/react'
import Header from '../components/Header'
import { ErrorPage } from '../components/ErrorPage'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

const FOOTER_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Terms & Conditions', href: '/terms-conditions' },
  {
    label: 'Careers',
    href: 'https://job-boards.greenhouse.io/govtechbarbados',
  },
]

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Government Services | Government of Barbados' },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
  errorComponent: ServerErrorPage,
})

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

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        className={`${textVariants({ size: 'body' })} grid min-h-screen grid-rows-[auto_1fr_auto] font-sans antialiased text-black-00 bg-white-00`}
      >
        <Header />
        <noscript>
          <div className="container py-8 lg:py-16">
            <div className="max-w-[837px] space-y-6 lg:space-y-8">
              <h1 className="text-5xl font-bold lg:text-[56px]">
                This site needs JavaScript to work properly
              </h1>
              <p>
                JavaScript is currently turned off in your browser, or your
                browser doesn't support it.
              </p>
              <div className="space-y-4">
                <h3 className="text-2xl font-bold">Suggestions:</h3>
                <ul className="list-disc space-y-2 ps-8">
                  <li>
                    Turn on JavaScript in your browser settings. The steps
                    differ by browser, but you'll usually find the option
                    under Settings → Privacy and Security, or Site Settings.
                    Once it's on, refresh this page.
                  </li>
                  <li>
                    Try a different browser. Most up-to-date browsers (Chrome,
                    Safari, Firefox, Edge) support JavaScript by default.
                  </li>
                  <li>
                    Update your browser. If you're using an older version,
                    updating may resolve the issue.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </noscript>
        <main id="main">{children}</main>
        <Footer
          links={FOOTER_LINKS}
          logoSrc="/images/coat-of-arms.png"
          logoAlt="Barbados Coat of Arms"
          copyrightText={`© ${new Date().getFullYear()} Government of Barbados`}
        />
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
