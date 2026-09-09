/**
 * Find an emergency shelter — landing page
 * --------------------------------------------------------------
 * Page body for /health-and-emergency-services/find-an-emergency-shelter.
 * Breadcrumbs and the "Was this helpful?" box come from the route's PageShell,
 * so this renders only the body.
 */

import { Heading, Link, LinkButton, Text } from '@govtech-bb/react'
import { format, parseISO } from 'date-fns'
import { getDemPhone, SHELTER_CONTENT } from '../-data/emergency-shelters'
import type { ShelterContent } from '../-data/emergency-shelters'
import { formatCopy } from '../-lib/copy'
import {
  EMERGENCY_SHELTER_FIND_HREF,
  EMERGENCY_SHELTER_GUIDANCE_HREF,
} from '../-lib/routes'

export function EmergencyShelterLandingPage({
  content = SHELTER_CONTENT,
}: { content?: ShelterContent } = {}) {
  const { landing: copy, common } = content.copy
  const dem = getDemPhone(content)
  const emergencyPhones = content.phoneDirectory.flatMap((group) =>
    group.entries.flatMap((entry) => {
      const phone = entry.contacts[0]
      return entry.landingLabel && phone
        ? [
            {
              id: entry.id,
              service: entry.landingLabel,
              number: phone.display,
              tel: phone.tel,
            },
          ]
        : []
    }),
  )
  return (
    <div className="mb-l flex max-w-2xl flex-col gap-m">
      <div className="flex flex-col gap-xs">
        <Heading as="h1">{content.copy.metadata.title}</Heading>
        <div className="border-blue-10 border-b-4 pb-4 text-grey-70">
          <Text as="p" size="body-sm">
            {formatCopy(common.freshness, {
              lastUpdated: format(parseISO(content.lastUpdated), 'PPP'),
              nextReview: format(parseISO(content.nextReview), 'PPP'),
            })}
          </Text>
        </div>
        <Text as="p" className="text-grey-70">
          {copy.introduction}
        </Text>
      </div>

      <div className="flex flex-col gap-xs">
        <LinkButton className="self-start" href={EMERGENCY_SHELTER_FIND_HREF}>
          {copy.findLabel}
        </LinkButton>
        <Text as="p" className="text-grey-70" size="body-sm">
          {copy.freeHint}
        </Text>
      </div>

      <section aria-labelledby="how-it-works" className="flex flex-col gap-s">
        <Heading as="h2" id="how-it-works">
          {copy.howHeading}
        </Heading>
        <Text as="p">{copy.searchInfo}</Text>
        <Text as="p">{copy.audience}</Text>
        <Text as="p">
          {copy.openingInfo} (<strong>{content.season}</strong>).
        </Text>
      </section>

      <section aria-labelledby="help-now" className="flex flex-col gap-s">
        <Heading as="h2" id="help-now">
          {copy.helpHeading}
        </Heading>
        <ul className="grid list-none auto-rows-fr grid-cols-1 gap-xs p-0 sm:grid-cols-2">
          {emergencyPhones.map((phone) => (
            <li key={phone.id}>
              <a
                className="flex h-full flex-col gap-xxs border-red-80 border-l-4 bg-red-10 p-s text-current no-underline transition-colors hover:bg-red-20 focus-visible:outline focus-visible:outline-4 focus-visible:outline-red-40 focus-visible:outline-offset-2"
                href={phone.tel}
              >
                <span className="font-bold">{phone.service}</span>
                <span className="font-bold text-red-80 text-body">
                  {phone.number}
                </span>
              </a>
            </li>
          ))}
        </ul>
        <Text as="p" size="body-sm">
          <Link href={`${EMERGENCY_SHELTER_GUIDANCE_HREF}#phone-numbers`}>
            {copy.phoneDirectoryLabel}
          </Link>
        </Text>
      </section>

      <section aria-labelledby="use-this" className="flex flex-col gap-s">
        <Heading as="h2" id="use-this">
          {copy.useHeading}
        </Heading>
        <ul className="list-disc space-y-xxs pl-6">
          {copy.useItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="what-youll-need"
        className="flex flex-col gap-s"
      >
        <Heading as="h2" id="what-youll-need">
          {copy.packingHeading}
        </Heading>
        <Text as="p">
          {copy.packingIntroduction}{' '}
          <Link href={`${EMERGENCY_SHELTER_GUIDANCE_HREF}#go-bag`}>
            {copy.goBagLinkLabel}
          </Link>
          .
        </Text>
      </section>

      <section aria-labelledby="key-things" className="flex flex-col gap-s">
        <Heading as="h2" id="key-things">
          {copy.keyHeading}
        </Heading>
        <ul className="list-disc space-y-xxs pl-6">
          {copy.keyItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Text as="p">
          <Link href={`${EMERGENCY_SHELTER_GUIDANCE_HREF}#rules`}>
            {copy.fullRulesLabel}
          </Link>{' '}
          {copy.beforeYouGo}
        </Text>
      </section>

      <section aria-labelledby="other-ways" className="flex flex-col gap-s">
        <Heading as="h2" id="other-ways">
          {copy.otherHeading}
        </Heading>
        <Text as="p">{copy.otherIntroduction}</Text>
        <ul className="list-disc space-y-xxs pl-6">
          {copy.otherItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
          <li>
            {copy.callDem}
            {dem && (
              <>
                {' '}
                {copy.callDemConnector}{' '}
                <Link href={dem.tel}>{dem.display}</Link>
              </>
            )}
          </li>
        </ul>
      </section>

      <aside className="border-blue-40 border-l-4 bg-blue-10 px-s py-xm">
        <Heading as="h2" size="h3">
          {copy.guidanceHeading}
        </Heading>
        <Text as="p">
          <Link href={EMERGENCY_SHELTER_GUIDANCE_HREF}>
            {copy.guidanceLinkLabel}
          </Link>{' '}
          {copy.guidanceIntroduction}
        </Text>
      </aside>

      <Text as="p" className="text-grey-70" size="body-sm">
        {common.source}
      </Text>
    </div>
  )
}
