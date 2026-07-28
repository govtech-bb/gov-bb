import { Text } from '@govtech-bb/react'
import type { ReactNode } from 'react'

export interface StatCard {
  label: string
  value: ReactNode
  /** Optional hover/focus explanation, shown as a tooltip below the card. */
  hint?: ReactNode
}

/**
 * A responsive row of headline stat cards (big value over a small label), used
 * for the site summary on the overview page and the per-form headline on the
 * detail page so both read the same. A card with a `hint` reveals it as a
 * tooltip on hover or keyboard focus.
 */
export function StatCards({ cards }: { cards: StatCard[] }) {
  return (
    <div className="mt-s flex flex-wrap gap-s">
      {cards.map((c, i) => {
        const hintId = c.hint
          ? `stat-hint-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
          : undefined
        // Cards in the latter half open their tooltip leftward so the rightmost
        // card can't push a 300px box past the viewport edge (horizontal scroll).
        const alignRight = i >= Math.ceil(cards.length / 2)
        return (
          <div
            key={c.label}
            tabIndex={c.hint ? 0 : undefined}
            aria-describedby={hintId}
            className={`group relative min-w-[130px] flex-1 rounded-lg border border-grey-00 px-m py-s${
              c.hint ? ' cursor-help' : ''
            }`}
          >
            <div className="text-[1.75rem] font-bold leading-tight">
              {c.value}
            </div>
            <Text as="span" size="small-caption" className="text-mid-grey-00">
              {c.label}
            </Text>
            {c.hint ? (
              <div
                id={hintId}
                role="tooltip"
                className={`pointer-events-none absolute ${
                  alignRight ? 'right-0' : 'left-0'
                } top-full z-50 mt-xs hidden w-[min(300px,90vw)] rounded-lg border border-grey-00 bg-white-00 p-s text-left text-caption font-normal leading-snug shadow-xl group-hover:block group-focus-within:block`}
              >
                {c.hint}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
