import { Text } from '@govtech-bb/react'
import type { ReactNode } from 'react'

export interface StatCard {
  label: string
  value: ReactNode
}

/**
 * A responsive row of headline stat cards (big value over a small label), used
 * for the site summary on the overview page and the per-form headline on the
 * detail page so both read the same.
 */
export function StatCards({ cards }: { cards: StatCard[] }) {
  return (
    <div className="mt-s flex flex-wrap gap-s">
      {cards.map((c) => (
        <div
          key={c.label}
          className="min-w-[130px] flex-1 rounded-lg border border-grey-00 px-m py-s"
        >
          <div className="text-[1.75rem] font-bold leading-tight">
            {c.value}
          </div>
          <Text as="span" size="small-caption" className="text-mid-grey-00">
            {c.label}
          </Text>
        </div>
      ))}
    </div>
  )
}
