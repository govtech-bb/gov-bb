import { PERMITS } from './permits'
import type { Permit, VenueFlag } from './permits'

export interface Features {
  music: boolean
  alcohol: boolean
  food: boolean
  stage: boolean
  tickets: boolean
  pyro: boolean
  copyright: boolean
}

export const EMPTY_FEATURES: Features = {
  music: false,
  alcohol: false,
  food: false,
  stage: false,
  tickets: false,
  pyro: false,
  copyright: false,
}

export function getActivePermits(
  venue: VenueFlag | null,
  features: Features,
): Array<Permit> {
  const flags: Record<string, boolean> = {
    private: venue === 'private',
    beach: venue === 'beach',
    road: venue === 'road',
    water: venue === 'water',
    ...features,
  }
  return PERMITS.filter(
    (p) => p.conditions.length === 0 || p.conditions.every((c) => flags[c]),
  )
}

export interface NumberedPermit {
  permit: Permit
  displayStep: number
}

/**
 * Assigns sequential display numbers to permits, collapsing consecutive
 * permits that share the same `step` value into the same display number.
 */
export function renumberSteps(permits: Array<Permit>): Array<NumberedPermit> {
  let n = 0
  let prev: number | null = null
  return permits.map((permit) => {
    if (permit.step !== prev) {
      n += 1
      prev = permit.step
    }
    return { permit, displayStep: n }
  })
}
