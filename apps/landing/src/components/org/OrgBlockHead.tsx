import { Heading, Link } from '@govtech-bb/react'

export interface OrgLink {
  label: string
  // ponytail: no href renders a placeholder <a> (styled, not focusable) until
  // the organisation's destination page exists.
  href?: string
  /** Off the platform: opens in a new tab. */
  external?: boolean
}

export function OrgBlockHead({
  title,
  seeAll,
}: {
  title: string
  seeAll?: OrgLink
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-s border-b-2 border-grey-20 pb-s">
      <Heading as="h2">{title}</Heading>
      {seeAll ? (
        <Link
          href={seeAll.href}
          external={seeAll.external}
          noUnderline
          className="shrink-0"
        >
          {seeAll.label}
        </Link>
      ) : null}
    </div>
  )
}
