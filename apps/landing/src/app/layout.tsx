import type { Metadata } from 'next'
import { Footer, textVariants } from '@govtech-bb/react'
import { Header } from '@/components/Header'
import './globals.css'

export const metadata: Metadata = {
  title: 'Government Services | Government of Barbados',
  description:
    "Access official Barbados government services online — apply for passports, birth certificates, driver's licences, and more at alpha.gov.bb.",
}

const FOOTER_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Terms & Conditions', href: '/terms-conditions' },
  {
    label: 'Careers',
    href: 'https://job-boards.greenhouse.io/govtechbarbados',
  },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div
          className={`${textVariants({ size: 'body' })} grid min-h-screen grid-rows-[auto_1fr_auto] font-sans antialiased text-black-00 bg-white-00`}
        >
          <Header />
          <main id="main">{children}</main>
          <Footer
            links={FOOTER_LINKS}
            logoSrc="/images/coat-of-arms.png"
            logoAlt="Barbados Coat of Arms"
            copyrightText={`© ${new Date().getFullYear()} Government of Barbados`}
          />
        </div>
      </body>
    </html>
  )
}
