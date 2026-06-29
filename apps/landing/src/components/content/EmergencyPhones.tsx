import type { ReactNode } from 'react'

/** A 2-column grid of red "call now" emergency phone tiles. */
export function EmergencyPhones({ children }: { children: ReactNode }) {
  return (
    <ul className="grid list-none auto-rows-fr grid-cols-1 gap-xs p-0 sm:grid-cols-2">
      {children}
    </ul>
  )
}

/**
 * A tappable emergency number tile. The accessible label is derived from the
 * label + number so authors only supply what they can see.
 */
export function EmergencyPhone({
  label,
  number,
  tel,
}: {
  label: string
  number: string
  tel: string
}) {
  return (
    <li>
      <a
        aria-label={`Call the ${label} on ${number.replace(/-/g, ' ')}`}
        href={tel}
        className="flex h-full flex-col gap-xxs border-red-00 border-l-4 bg-red-10 p-s text-current no-underline transition-colors hover:bg-red-40 focus-visible:outline focus-visible:outline-4 focus-visible:outline-red-100 focus-visible:outline-offset-2"
      >
        <span className="font-bold">{label}</span>
        <span className="font-bold text-red-00 text-xl">{number}</span>
      </a>
    </li>
  )
}
