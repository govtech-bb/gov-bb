import { Link, ServiceList, ServiceListItem } from '@govtech-bb/react'
import type { OrgService } from './OrgTiles'

/** The list style of the services block: the design system service list. */
export function OrgServiceList({ items }: { items: Array<OrgService> }) {
  return (
    <ServiceList>
      {items.map((service) => (
        <ServiceListItem
          key={service.title}
          // The DS types href as required; renderLink below owns the real one.
          href={service.href ?? ''}
          description={service.description}
          renderLink={({ className, children }) => (
            <Link
              href={service.href}
              external={service.external}
              className={className}
            >
              {children}
            </Link>
          )}
        >
          {service.title}
        </ServiceListItem>
      ))}
    </ServiceList>
  )
}
