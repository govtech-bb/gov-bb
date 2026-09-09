/**
 * Water-outage display helpers for the landing page: the Outage shape plus the
 * date/freshness rules used to render notices. Pure — no DOM, SSR-safe.
 *
 * The feed parsing (fetch + classify + parish match) lives in the API
 * (apps/api water-alerts). This is only the presentation subset the page needs;
 * the API returns already-parsed Outage objects.
 */
export type OutageType = 'emergency' | 'planned' | 'repair' | 'notice'

export interface Outage {
  id: string
  title: string
  link: string
  published: string
  summary: string
  parishes: string[]
  type: OutageType
  eventDay?: string
  endsAt?: string
}

export const OUTAGE_TYPE_LABEL: Record<OutageType, string> = {
  emergency: 'Emergency',
  planned: 'Planned work',
  repair: 'Repair',
  notice: 'Notice',
}

const BB_TZ = 'America/Barbados'
const STALE_DAYS = 3

/** "YYYY-MM-DD" for a date, in Barbados local time. */
export function bbDayKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: BB_TZ })
}

/** Has the notice's stated period passed, or is an undated notice over three days old? */
export function isPast(o: Outage, nowMs: number): boolean {
  if (o.endsAt) return nowMs > Date.parse(o.endsAt)
  if (o.eventDay) return o.eventDay < bbDayKey(new Date(nowMs))
  return nowMs - Date.parse(o.published) > STALE_DAYS * 86_400_000
}

/** Is this a recent notice or one whose stated period has not passed? */
export function isCurrentConcern(o: Outage, nowMs: number): boolean {
  if (isPast(o, nowMs)) return false
  if (o.eventDay) return o.eventDay >= bbDayKey(new Date(nowMs))
  return true
}

/** Short date label; an older notice does not confirm restored service. */
export function freshnessLabel(o: Outage, nowMs: number): string {
  if (isPast(o, nowMs)) return 'Older notice'
  const key = o.eventDay ?? bbDayKey(new Date(o.published))
  if (key === bbDayKey(new Date(nowMs))) return 'Today'
  if (key === bbDayKey(new Date(nowMs + 86_400_000))) return 'Tomorrow'
  const [y, mo, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, 12)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
