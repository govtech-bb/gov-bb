import { Heading, Text } from '@govtech-bb/react'

export interface OrgOffice {
  name: string
  /** One line per entry. */
  address: Array<string>
  phone: string
}

export function OrgOffices({ items }: { items: Array<OrgOffice> }) {
  return (
    <ul className="grid items-start gap-m sm:grid-cols-2">
      {items.map((office) => (
        <li
          key={office.name}
          className="space-y-xs rounded border-2 border-grey-20 bg-white-00 p-xm"
        >
          <Heading as="h3" size="h4">
            {office.name}
          </Heading>
          <Text as="p" className="whitespace-pre-line">
            {office.address.join('\n')}
          </Text>
          <Text as="p" size="body-sm" className="text-grey-70">
            {office.phone}
          </Text>
        </li>
      ))}
    </ul>
  )
}
