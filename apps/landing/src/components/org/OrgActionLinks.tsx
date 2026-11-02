import { Link } from '@govtech-bb/react'
import type { OrgLink } from './OrgBlockHead'

/** NHS-style action links for a short group of things to start. They keep the platform service green. */
export function OrgActionLinks({ items }: { items: Array<OrgLink> }) {
  return (
    <ul className="space-y-5 [--govbb-link-color:var(--govbb-color-tertiary)]">
      {items.map((item) => (
        <li key={item.label}>
          <Link
            href={item.href}
            external={item.external}
            noUnderline
            className="govbb-text-h4 inline-flex items-center gap-3"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-green-80">
              <span
                aria-hidden="true"
                className="h-2.5 w-[13.75px] bg-white-00 [mask:url(/images/org/trident-arrow.svg)_center/contain_no-repeat]"
              />
            </span>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
