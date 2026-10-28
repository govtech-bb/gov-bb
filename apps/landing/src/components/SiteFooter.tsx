import { Footer, FooterLink } from '@govtech-bb/react'
import { assetUrl } from '../lib/asset-url'

const links = [
  { label: 'Home', href: '/', event: 'footer-home' },
  {
    label: 'Terms & Conditions',
    href: '/terms-conditions',
    event: 'footer-terms',
  },
  {
    label: 'Careers',
    href: 'https://job-boards.greenhouse.io/govtechbarbados',
    event: 'footer-careers',
  },
]

/** Public site footer; the CMS preview supplies an asset origin and no analytics callback. */
export function SiteFooter({
  assetBase,
  onNavigate,
}: {
  assetBase?: string
  onNavigate?: (event: string) => void
}) {
  return (
    <Footer
      className="print:hidden"
      coatSrc={assetUrl('/images/govbb-crest.svg', assetBase)}
      copy={`© ${new Date().getFullYear()} Government of Barbados`}
    >
      {links.map(({ label, href, event }) => (
        <FooterLink
          key={label}
          href={href}
          onClick={onNavigate ? () => onNavigate(event) : undefined}
        >
          {label}
        </FooterLink>
      ))}
    </Footer>
  )
}
