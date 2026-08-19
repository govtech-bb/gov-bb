/**
 * Typed caveat — per-record uncertainty, typed rather than uniform.
 * coverage = which prescription slips this pharmacy will not
 * honour (highest stakes, yellow); confidence = how sure we are of the
 * details (grey); channel = an alternative ordering route (teal, usually
 * carrying a link). House tokens: 4px left bar + tint + caption text.
 */

import { Text } from '@govtech-bb/react'
import type { ReactNode } from 'react'

export type CaveatTone = 'coverage' | 'confidence' | 'channel'

const TONES = {
  coverage: 'border-yellow-00 bg-yellow-40',
  confidence: 'border-mid-grey-00 bg-grey-00',
  channel: 'border-teal-00 bg-teal-10',
} satisfies Record<CaveatTone, string>

export function Caveat({
  tone = 'coverage',
  children,
}: {
  tone?: CaveatTone
  children: ReactNode
}) {
  return (
    <div className={`border-l-4 px-s py-xs ${TONES[tone]}`}>
      <Text
        as="p"
        className={tone === 'confidence' ? 'text-mid-grey-00' : undefined}
        size="caption"
      >
        {children}
      </Text>
    </div>
  )
}
