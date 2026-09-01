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
  coverage: 'border-yellow-80 bg-yellow-20',
  confidence: 'border-grey-70 bg-grey-20',
  channel: 'border-teal-80 bg-teal-10',
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
        className={tone === 'confidence' ? 'text-grey-70' : undefined}
        size="body-sm"
      >
        {children}
      </Text>
    </div>
  )
}
