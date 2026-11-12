/**
 * Pharmacy finder analytics (ADR 0079).
 * --------------------------------------------------------------
 * The codes this tool sends with the shared tool events. Only codes, counts
 * and yes/no flags leave the page: never the search text, the visitor's
 * location or a distance.
 */

import { trackEvent } from '@/lib/analytics'
import type { Pharmacy } from '../-data/pharmacies'

export type PharmacyAction =
  | 'view-detail'
  | 'call'
  | 'directions'
  | 'call-drug-service'
  | 'slip-colours'

/** 'St. Michael' → 'st-michael', the platform's parish code. */
export function parishCode(parish: string): string {
  return parish.toLowerCase().replace(/[^a-z]+/g, '-')
}

/** `target` is the pharmacy's slug, an ID defined in code. */
export function trackPharmacyAction(
  action: PharmacyAction,
  pharmacy?: Pick<Pharmacy, 'slug'>,
): void {
  trackEvent('tool-action', {
    tool: 'pharmacy-finder',
    action,
    target: pharmacy?.slug,
  })
}
