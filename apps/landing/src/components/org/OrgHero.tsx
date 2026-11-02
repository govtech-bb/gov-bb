import { Heading, Link, LinkButton, Text } from '@govtech-bb/react'
import { Breadcrumbs } from '../Breadcrumbs'
import { OrgMediaSlot } from './OrgMediaSlot'
import type { OrgLink } from './OrgBlockHead'

export interface OrgHeroProps {
  /** White type on the dark wall-00. The default is the image-led hero on wall-10. */
  masthead?: boolean
  name: string
  lede: string
  logo?: { src: string; alt: string }
  action: OrgLink
  link: OrgLink
  /** What the hero photo will show. Image-led only. */
  caption?: string
}

/** The trail sits inside the band so no white strip separates the alpha banner from the wall. */
export function OrgHero({
  masthead,
  name,
  lede,
  logo,
  action,
  link,
  caption,
}: OrgHeroProps) {
  return (
    <div
      className={`border-b-6 border-(--org-shutter-100) ${masthead ? 'bg-(--org-wall-00) text-white-00 [--govbb-color-muted:rgb(255_255_255/0.7)] [--govbb-link-color:var(--govbb-white-00)]' : 'bg-(--org-wall-10)'}`}
    >
      <div className="govbb-width-container space-y-m pt-s pb-ml">
        <Breadcrumbs />
        <div className="grid gap-m lg:grid-cols-[832fr_392fr]">
          <div className="space-y-m">
            {logo ? (
              <img
                src={logo.src}
                alt={logo.alt}
                className="h-11 w-auto lg:h-14"
              />
            ) : null}
            <Heading as="h1">{name}</Heading>
            <Text as="p" size="body-lg" className="max-w-190">
              {lede}
            </Text>
            <div className="flex flex-wrap items-center gap-s">
              <LinkButton
                href={action.href}
                external={action.external}
                inverse={masthead}
              >
                {action.label}
              </LinkButton>
              <Link href={link.href} external={link.external}>
                {link.label}
              </Link>
            </div>
          </div>
          {caption ? (
            <OrgMediaSlot
              caption={caption}
              className="aspect-4/3 lg:aspect-auto"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
