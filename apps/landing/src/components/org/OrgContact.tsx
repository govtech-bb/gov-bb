import { Heading } from '@govtech-bb/react'

export interface OrgContactDetails {
  heading: string
  phone: string
  email: string
  /** One line per entry. */
  address: Array<string>
  openingHours: string
}

export function OrgContact({ contact }: { contact: OrgContactDetails }) {
  const rows: Array<[string, string]> = [
    ['Phone', contact.phone],
    ['Email', contact.email],
    ['Address', contact.address.join('\n')],
    ['Opening hours', contact.openingHours],
  ]
  return (
    <section className="space-y-s self-start rounded-b border-t-6 border-(--org-wall-100) bg-(--org-wall-10) p-xm">
      <Heading as="h2" size="h3">
        {contact.heading}
      </Heading>
      <dl className="space-y-s">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="govbb-text-h4">{label}</dt>
            <dd className="whitespace-pre-line">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
