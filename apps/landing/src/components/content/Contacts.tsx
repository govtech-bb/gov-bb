import type { ReactNode } from 'react'

/** Grid of tappable contact tiles. */
export function Contacts({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-s md:grid-cols-3">{children}</div>
}

/** A tappable phone-number tile. `emphasis="emergency"` is the red full-width variant. */
export function Contact({
  label,
  number,
  tel,
  ariaLabel,
  emphasis,
}: {
  label: string
  number: string
  tel: string
  ariaLabel?: string
  emphasis?: 'emergency'
}) {
  const emergency = emphasis === 'emergency'
  return (
    <a
      aria-label={ariaLabel}
      href={tel}
      className={
        emergency
          ? 'col-span-full flex flex-col gap-xxs border-red-00 border-l-4 bg-red-10 p-s text-current no-underline transition-colors hover:bg-red-40 focus-visible:outline focus-visible:outline-4 focus-visible:outline-red-100 focus-visible:outline-offset-2'
          : 'flex flex-col gap-xxs border-teal-00 border-l-4 bg-teal-10 p-s text-current no-underline transition-colors hover:bg-teal-40 focus-visible:outline focus-visible:outline-4 focus-visible:outline-teal-100 focus-visible:outline-offset-2'
      }
    >
      {emergency ? (
        <span className="font-bold text-red-00 text-xs uppercase tracking-wider">
          Emergency
        </span>
      ) : null}
      <span className="font-bold">{label}</span>
      <span
        className={
          emergency
            ? 'font-bold text-2xl text-red-00'
            : 'font-bold text-teal-00 text-xl'
        }
      >
        {number}
      </span>
    </a>
  )
}
