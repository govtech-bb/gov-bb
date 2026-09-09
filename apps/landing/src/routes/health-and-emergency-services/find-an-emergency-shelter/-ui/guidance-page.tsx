/**
 * Before you go to a shelter — guidance page
 * --------------------------------------------------------------
 * Page body for
 * /health-and-emergency-services/find-an-emergency-shelter/guidance. Long-form
 * reference content: Go Bag, shelter rules, entry protocol, accessible
 * shelters, District Emergency Organisation contacts, hurricane terms and the
 * phone directory.
 */

import { Heading, Link, ShowHide, Text } from '@govtech-bb/react'
import { format, parseISO } from 'date-fns'
import { getDemPhone, SHELTER_CONTENT } from '../-data/emergency-shelters'
import type { ShelterContent } from '../-data/emergency-shelters'
import { formatCopy } from '../-lib/copy'
import type { PhoneEntry } from '../-data/guidance-data'
import { EMERGENCY_SHELTER_FIND_HREF } from '../-lib/routes'

export const TITLE = SHELTER_CONTENT.copy.guidance.title
export const DESCRIPTION = SHELTER_CONTENT.copy.guidance.description

const CONTENTS = [
  { id: 'go-bag', section: 'goBag' },
  { id: 'before-you-leave', section: 'beforeYouLeave' },
  { id: 'what-to-expect', section: 'arrival' },
  { id: 'rules', section: 'rules' },
  { id: 'protocol', section: 'protocol' },
  { id: 'accessible-shelters', section: 'accessible' },
  { id: 'district-organisations', section: 'districts' },
  { id: 'hurricane-terms', section: 'terms' },
  { id: 'phone-numbers', section: 'phones' },
] as const

export function EmergencyShelterGuidancePage({
  content = SHELTER_CONTENT,
}: { content?: ShelterContent } = {}) {
  const { guidance: copy, common } = content.copy
  const dem = getDemPhone(content)
  const accessibleShelters = content.shelters.filter(
    (shelter) => shelter.access,
  )
  const accessibleCategory1 = accessibleShelters.filter(
    (shelter) => shelter.category === 1,
  )
  const accessibleCategory2 = accessibleShelters.filter(
    (shelter) => shelter.category === 2,
  )
  return (
    <div className="mb-l flex max-w-[44rem] flex-col gap-m">
      <div className="flex flex-col gap-xs">
        <Heading as="h1">{copy.title}</Heading>
        <div className="border-blue-10 border-b-4 pb-4 text-grey-70">
          <Text as="p" size="body-sm">
            {formatCopy(common.freshness, {
              lastUpdated: format(parseISO(content.lastUpdated), 'PPP'),
              nextReview: format(parseISO(content.nextReview), 'PPP'),
            })}
          </Text>
        </div>
      </div>

      <Text as="p" className="text-grey-70">
        {copy.introduction}
      </Text>

      <nav
        aria-labelledby="contents-heading"
        className="flex flex-col gap-s border-teal-80 border-l-4 bg-teal-10 p-s"
      >
        <Heading as="h2" id="contents-heading" size="h3">
          {copy.contentsHeading}
        </Heading>
        <ul className="list-disc space-y-xs pl-6">
          {CONTENTS.map((item) => (
            <li key={item.id}>
              <Link href={`#${item.id}`}>{copy[item.section].heading}</Link>
            </li>
          ))}
        </ul>
      </nav>

      <GuidanceSection heading={copy.goBag.heading} id="go-bag">
        <Text as="p">{copy.goBag.introduction}</Text>
        <BulletList items={copy.goBag.items} />
        <Text as="p">
          {copy.goBag.kitPrefix} <strong>{copy.goBag.kitEmphasis}</strong>{' '}
          {copy.goBag.kitSuffix}
        </Text>
      </GuidanceSection>

      <GuidanceSection
        heading={copy.beforeYouLeave.heading}
        id="before-you-leave"
      >
        <BulletList items={copy.beforeYouLeave.items} />
        <Text as="p">
          <strong>{copy.beforeYouLeave.petsEmphasis}</strong>{' '}
          {copy.beforeYouLeave.petsAdvice}
        </Text>
      </GuidanceSection>

      <GuidanceSection heading={copy.arrival.heading} id="what-to-expect">
        <BulletList items={copy.arrival.items} />
      </GuidanceSection>

      <GuidanceSection heading={copy.rules.heading} id="rules">
        <Text as="p">{copy.rules.introduction}</Text>
        <Text as="p">
          {copy.rules.you} <strong>{copy.rules.cannot}</strong>{' '}
          {copy.rules.bring}
        </Text>
        <BulletList items={copy.rules.prohibitedItems} />
        <Text as="p">
          {copy.rules.you} <strong>{copy.rules.cannot}</strong>:
        </Text>
        <BulletList items={copy.rules.prohibitedActions} />
        <Text as="p">
          {copy.rules.propertyPrefix}{' '}
          <strong>{copy.rules.propertyEmphasis}</strong>{' '}
          {copy.rules.propertySuffix}
        </Text>
        <Text as="p">{copy.rules.stateOfEmergency}</Text>
      </GuidanceSection>

      <GuidanceSection heading={copy.protocol.heading} id="protocol">
        <BulletList items={copy.protocol.items} />
        <Text as="p">{copy.protocol.seasonInformation}</Text>
      </GuidanceSection>

      <GuidanceSection
        heading={copy.accessible.heading}
        id="accessible-shelters"
      >
        <Text as="p">
          {formatCopy(copy.accessible.introduction, {
            count: accessibleShelters.length,
          })}
        </Text>
        <Heading as="h3" size="h3">
          {copy.accessible.category1Heading}
        </Heading>
        <BulletList
          items={accessibleCategory1.map((s) => `${s.name} — ${s.parish}`)}
        />
        <Heading as="h3" size="h3">
          {copy.accessible.category2Heading}
        </Heading>
        <BulletList
          items={accessibleCategory2.map((s) => `${s.name} — ${s.parish}`)}
        />
      </GuidanceSection>

      <GuidanceSection
        heading={copy.districts.heading}
        id="district-organisations"
      >
        <Text as="p">{copy.districts.introduction}</Text>
        <ShowHide summary={copy.districts.summary}>
          <ul className="m-0 flex list-none flex-col p-0">
            {content.districtChairs.map((chair) => (
              <li
                className="grid gap-0.5 border-grey-20 border-b py-s sm:grid-cols-[1fr_1fr] sm:items-baseline sm:gap-6"
                key={chair.id}
              >
                <span className="font-bold">{chair.district}</span>
                <span>
                  {chair.name} — <Link href={chair.tel}>{chair.number}</Link>
                </span>
              </li>
            ))}
          </ul>
          <Text as="p" className="mt-s text-grey-70" size="body-sm">
            {copy.districts.missingIntroduction}
            {dem && (
              <>
                {' '}
                {common.phoneConnector}{' '}
                <Link href={dem.tel}>{dem.display}</Link>
              </>
            )}{' '}
            {copy.districts.missingSuffix}
          </Text>
        </ShowHide>
      </GuidanceSection>

      <GuidanceSection heading={copy.terms.heading} id="hurricane-terms">
        <Text as="p">{copy.terms.introduction}</Text>
        <dl className="m-0 flex flex-col">
          {content.hurricaneTerms.map((entry) => (
            <div
              className="flex flex-col gap-0.5 border-grey-20 border-b py-s"
              key={entry.id}
            >
              <dt className="font-bold">{entry.term}</dt>
              <dd className="m-0 text-grey-70">{entry.definition}</dd>
            </div>
          ))}
        </dl>
      </GuidanceSection>

      <GuidanceSection heading={copy.phones.heading} id="phone-numbers">
        <Text as="p">{copy.phones.introduction}</Text>
        {content.phoneDirectory.map((group) => (
          <div className="flex flex-col gap-s" key={group.id}>
            <Heading as="h3" size="h3">
              {group.heading}
            </Heading>
            <ul className="m-0 flex list-none flex-col p-0">
              {group.entries.map((entry) => (
                <PhoneRow entry={entry} key={entry.id} />
              ))}
            </ul>
          </div>
        ))}
      </GuidanceSection>

      <aside className="border-grey-20 border-t pt-m">
        <Heading as="h2" size="h3">
          {copy.findHeading}
        </Heading>
        <Text as="p">
          <Link href={EMERGENCY_SHELTER_FIND_HREF}>{copy.findLabel}</Link>
        </Text>
      </aside>

      <Text as="p" className="text-grey-70" size="body-sm">
        {common.source}
      </Text>
    </div>
  )
}

function GuidanceSection({
  id,
  heading,
  children,
}: {
  id: string
  heading: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex scroll-mt-m flex-col gap-s"
      id={id}
    >
      <Heading as="h2" id={`${id}-heading`}>
        {heading}
      </Heading>
      {children}
    </section>
  )
}

function BulletList({ items }: { items: ReadonlyArray<string> }) {
  return (
    <ul className="list-disc space-y-xs pl-6">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function PhoneRow({ entry }: { entry: PhoneEntry }) {
  return (
    <li className="grid gap-0.5 border-grey-20 border-b py-s sm:grid-cols-[1fr_1fr] sm:items-baseline sm:gap-6">
      <span className="font-bold">{entry.label}</span>
      <span>
        {entry.contacts.map((contact, index) => (
          <span key={contact.id}>
            {index > 0 && ', '}
            <Link href={contact.tel}>{contact.display}</Link>
            {contact.note ? ` ${contact.note}` : ''}
          </span>
        ))}
      </span>
    </li>
  )
}
