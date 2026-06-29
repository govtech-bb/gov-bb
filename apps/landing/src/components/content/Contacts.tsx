import type { ReactNode } from 'react'

/** Grid of tappable contact tiles. */
export function Contacts({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-s md:grid-cols-3">{children}</div>
}

/**
 * A tappable phone-number tile. `emergency` (a bare directive flag) is the red,
 * full-width variant. The accessible label is derived from the label + number,
 * so authors only supply what they can see.
 */
export function Contact({
  label,
  number,
  tel,
  emergency,
}: {
  label: string
  number: string
  tel: string
  emergency?: boolean | string
}) {
  const isEmergency =
    emergency !== undefined && emergency !== false && emergency !== 'false'
  const ariaLabel = `Call the ${label} on ${number.replace(/-/g, ' ')}`
  return (
    <a
      aria-label={ariaLabel}
      href={tel}
      className={
        isEmergency
          ? 'col-span-full flex flex-col gap-xxs border-red-00 border-l-4 bg-red-10 p-s text-current no-underline transition-colors hover:bg-red-40 focus-visible:outline focus-visible:outline-4 focus-visible:outline-red-100 focus-visible:outline-offset-2'
          : 'flex flex-col gap-xxs border-teal-00 border-l-4 bg-teal-10 p-s text-current no-underline transition-colors hover:bg-teal-40 focus-visible:outline focus-visible:outline-4 focus-visible:outline-teal-100 focus-visible:outline-offset-2'
      }
    >
      {isEmergency ? (
        <span className="font-bold text-red-00 text-xs uppercase tracking-wider">
          Emergency
        </span>
      ) : null}
      <span className="font-bold">{label}</span>
      <span
        className={
          isEmergency
            ? 'font-bold text-2xl text-red-00'
            : 'font-bold text-teal-00 text-xl'
        }
      >
        {number}
      </span>
    </a>
  )
}
