import { Heading, Link, Text } from '@govtech-bb/react'

export interface OrgService {
  title: string
  description: string
  href?: string
  external?: boolean
}

/**
 * Bordered service tiles. Links keep the platform service green, never the
 * house colour, and stretch over the tile so the whole card is the target.
 */
export function OrgTiles({ items }: { items: Array<OrgService> }) {
  return (
    <ul className="grid gap-m [--govbb-link-color:var(--govbb-color-tertiary)] md:grid-cols-2 lg:grid-cols-3">
      {items.map((service) => (
        <li
          key={service.title}
          className="relative flex items-center gap-s rounded border-2 border-grey-20 bg-white-00 p-xm"
        >
          <div className="flex-1 space-y-xs">
            <Heading as="h3" size="h4">
              <Link
                href={service.href}
                external={service.external}
                noUnderline
                className="after:absolute after:inset-0"
              >
                {service.title}
              </Link>
            </Heading>
            <Text as="p" size="body-sm">
              {service.description}
            </Text>
          </div>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-green-80">
            <span
              aria-hidden="true"
              className="h-2.5 w-[8.75px] bg-white-00 [mask:url(/images/org/trident-chevron.svg)_center/contain_no-repeat]"
            />
          </span>
        </li>
      ))}
    </ul>
  )
}
