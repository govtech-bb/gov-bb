import { format } from 'date-fns'

/**
 * Render a frontmatter `publish_date` as its UTC calendar day. The value is
 * stored as UTC midnight (`new Date("2026-06-04")`), so formatting it in the
 * runtime's local zone rolls back a day anywhere west of UTC. Rebuild the date
 * from its UTC parts so the displayed day is timezone-stable.
 */
export function formatPublishDate(date: Date): string {
  const utc = new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  )
  return format(utc, 'PPP')
}
