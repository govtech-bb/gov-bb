import { Heading, Link, Text } from '@govtech-bb/react'

export interface OrgNewsItem {
  /** ISO calendar date, e.g. 2026-09-18. */
  date: string
  title: string
  summary: string
  href?: string
  external?: boolean
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export function OrgNews({ items }: { items: Array<OrgNewsItem> }) {
  return (
    <ul>
      {items.map((item) => (
        <li
          key={item.title}
          className="flex flex-col gap-xxs border-t-2 border-grey-20 py-s first:border-t-0 sm:flex-row sm:gap-m"
        >
          <Text
            as="p"
            size="body-sm"
            className="text-grey-70 sm:w-32 sm:shrink-0"
          >
            <time dateTime={item.date}>
              {DATE_FORMAT.format(new Date(item.date))}
            </time>
          </Text>
          <div className="space-y-xxs">
            <Heading as="h3" size="h4">
              <Link href={item.href} external={item.external} noUnderline>
                {item.title}
              </Link>
            </Heading>
            <Text as="p">{item.summary}</Text>
          </div>
        </li>
      ))}
    </ul>
  )
}
