import { Heading, Link, StatusBanner, Text } from '@govtech-bb/react'
import { MarkdownBody } from '../../../../components/markdown/MarkdownContent'
import { orgHref } from '../-lib/orgs'
import type { ContactItem, Org, OrgKind } from '../-lib/orgs'

const LEADERSHIP_LABEL: Record<OrgKind, string> = {
  ministry: 'Our Minister',
  department: 'Head of Department',
  'state-body': 'Head',
}

function ContactValue({ item }: { item: ContactItem }) {
  switch (item.type) {
    case 'phone':
      return (
        <Link
          className="text-teal-80"
          href={`tel:${item.value.replace(/[^\d+]/g, '')}`}
        >
          {item.value}
        </Link>
      )
    case 'email':
      return (
        <Link className="break-all text-teal-80" href={`mailto:${item.value}`}>
          {item.value}
        </Link>
      )
    case 'website':
      return (
        <Link
          className="break-all text-teal-80"
          href={
            item.value.startsWith('http') ? item.value : `https://${item.value}`
          }
          external
        >
          {item.display ?? item.value}
        </Link>
      )
    case 'address': {
      const lines = Array.isArray(item.value) ? item.value : [item.value]
      return (
        <span className="text-black-00">
          {lines.map((line, i) => (
            <span key={i}>
              {line}
              {i < lines.length - 1 ? <br /> : null}
            </span>
          ))}
        </span>
      )
    }
  }
}

export function OrgPage({ org }: { org: Org }) {
  const leader = org.minister ?? org.head

  return (
    <>
      <StatusBanner variant="migrated" fullWidth>
        <p>
          This page has been migrated from{' '}
          <Link href={org.originalSource} external>
            gov.bb
          </Link>
          .
        </p>
      </StatusBanner>

      <section className="bg-teal-80 py-l text-white-00">
        <div className="govbb-width-container">
          <Heading as="h1" className="text-white-00">
            {org.name}
          </Heading>
        </div>
      </section>

      <div className="govbb-width-container py-m">
        <div className="grid grid-cols-1 gap-l lg:grid-cols-[2fr_1fr] lg:gap-xl">
          <div className="flex flex-col gap-l">
            <MarkdownBody hast={org.hast} />

            {org.onlineServices.length > 0 ? (
              <section>
                <Heading as="h2" className="mb-s">
                  Online services
                </Heading>
                <ul className="flex flex-col">
                  {org.onlineServices.map((service) => (
                    <li
                      className="flex flex-col gap-xxs border-blue-10 border-b py-s"
                      key={service.href}
                    >
                      <Heading as="h3">
                        <Link href={service.href}>{service.title}</Link>
                      </Heading>
                      <Text as="p">{service.description}</Text>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside
            aria-label="Organisation information"
            className="flex flex-col gap-m"
          >
            {leader ? (
              <div className="flex flex-col gap-s rounded-md bg-[#f5f7fa] p-xm">
                <p className="font-bold text-[20px] text-black-00 leading-normal">
                  {LEADERSHIP_LABEL[org.kind]}
                </p>
                <div className="flex flex-col gap-xxs leading-normal">
                  <span className="font-bold text-[20px] text-teal-80">
                    {leader.name}
                  </span>
                  <span className="text-[16px] text-grey-70">
                    {leader.role}
                  </span>
                </div>
              </div>
            ) : null}

            {org.contact.length > 0 ? (
              <div className="flex flex-col gap-s rounded-md bg-[#f5f7fa] p-xm">
                <p className="font-bold text-[20px] text-black-00 leading-normal">
                  Contact
                </p>
                <dl className="flex flex-col gap-s">
                  {org.contact.map((item, i) => (
                    <div className="flex flex-col gap-xxs" key={i}>
                      <dt className="text-[14px] text-grey-70">{item.label}</dt>
                      <dd className="m-0 text-[16px]">
                        <ContactValue item={item} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {org.associatedDepartments.length > 0 ? (
              <div className="flex flex-col gap-s rounded-md bg-[#f5f7fa] p-xm">
                <p className="font-bold text-[20px] text-black-00 leading-normal">
                  Associated Departments
                </p>
                <div className="flex flex-col gap-s">
                  {org.associatedDepartments.map((group, i) => (
                    <div
                      className="flex flex-col gap-xxs"
                      key={group.category || i}
                    >
                      {group.category ? (
                        <p className="font-bold text-[14px] text-grey-70">
                          {group.category}
                        </p>
                      ) : null}
                      <ul className="flex flex-col gap-xxs">
                        {group.items.map((dept) => (
                          <li
                            className="text-[16px] text-black-00"
                            key={dept.name}
                          >
                            {dept.slug ? (
                              <Link href={orgHref(dept.slug)}>{dept.name}</Link>
                            ) : (
                              dept.name
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  )
}
