import { Heading, Link, Text } from '@govtech-bb/react'
import { OrgMediaSlot } from './OrgMediaSlot'

export interface OrgCard {
  title: string
  description: string
  /** What the image slot will show, e.g. "Cover: …". */
  caption: string
  href?: string
  external?: boolean
}

/** Programme and publication cards: 16:9 image, linked title in the house colour, one-line description. */
export function OrgCards({ items }: { items: Array<OrgCard> }) {
  return (
    <ul className="grid gap-m sm:grid-cols-2 lg:grid-cols-3">
      {items.map((card) => (
        <li key={card.title} className="space-y-xs">
          <OrgMediaSlot caption={card.caption} className="aspect-video" />
          <Heading as="h3" size="h4">
            <Link href={card.href} external={card.external} noUnderline>
              {card.title}
            </Link>
          </Heading>
          <Text as="p">{card.description}</Text>
        </li>
      ))}
    </ul>
  )
}
