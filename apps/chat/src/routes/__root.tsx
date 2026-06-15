import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { Footer, textVariants } from '@govtech-bb/react'

import { LANDING_URL } from '#/config/landing'

import appCss from '../styles.css?url'

const FOOTER_LINKS = [
  { label: 'Home', href: `${LANDING_URL}/` },
  { label: 'Terms & Conditions', href: `${LANDING_URL}/terms-conditions` },
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
      { title: 'Ask alpha.gov.bb' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        className={`${textVariants({ size: 'body' })} grid min-h-dvh grid-rows-[auto_1fr_auto] font-sans antialiased text-black-00 bg-white-00`}
      >
        <main id="main" className="min-h-0">{children}</main>
        <div className="hidden md:block">
          <Footer
            links={FOOTER_LINKS}
            logoSrc="/images/coat-of-arms.png"
            logoAlt="Barbados Coat of Arms"
            copyrightText={`© ${new Date().getFullYear()} Government of Barbados`}
          />
        </div>
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
