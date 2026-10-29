import type { ReactNode } from 'react'

/** A non-emergency contact tile. A record's details (ContactRecord) use it too. */
export const CONTACT_TILE =
  'flex flex-col gap-xxs border-teal-80 border-l-4 bg-teal-10 p-s text-current'

/** A tile that is a link: tappable, so it shows hover and focus. */
export const CONTACT_TILE_LINK = `${CONTACT_TILE} no-underline transition-colors hover:bg-teal-20 focus-visible:outline focus-visible:outline-4 focus-visible:outline-teal-40 focus-visible:outline-offset-2`

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
          ? 'col-span-full flex flex-col gap-xxs border-red-80 border-l-4 bg-red-10 p-s text-current no-underline transition-colors hover:bg-red-20 focus-visible:outline focus-visible:outline-4 focus-visible:outline-red-40 focus-visible:outline-offset-2'
          : CONTACT_TILE_LINK
      }
    >
      {isEmergency ? (
        <span className="font-bold text-red-80 text-body-sm uppercase tracking-wider">
          Emergency
        </span>
      ) : null}
      <span className="font-bold">{label}</span>
      <span
        className={
          isEmergency
            ? 'font-bold text-body-lg text-red-80'
            : 'font-bold text-teal-80 text-body'
        }
      >
        {number}
      </span>
    </a>
  )
}
