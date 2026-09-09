/**
 * Emergency shelter finder — page wrapper
 * --------------------------------------------------------------
 * Page body for /health-and-emergency-services/find-an-emergency-shelter/find.
 * Renders the static heading, freshness, activation notice and source, and
 * hands the interactive list off to <ShelterFinder>.
 */

import { Heading, Link, Text } from '@govtech-bb/react'
import { format, parseISO } from 'date-fns'
import { getDemPhone, SHELTER_CONTENT } from '../-data/emergency-shelters'
import type { ShelterContent } from '../-data/emergency-shelters'
import { formatCopy } from '../-lib/copy'
import { EMERGENCY_SHELTER_GUIDANCE_HREF } from '../-lib/routes'
import { ShelterFinder } from './shelter-finder'

export const TITLE = SHELTER_CONTENT.copy.findPage.title
export const DESCRIPTION = formatCopy(
  SHELTER_CONTENT.copy.findPage.description,
  { count: SHELTER_CONTENT.shelters.length },
)

export function FindEmergencyShelterPage({
  content = SHELTER_CONTENT,
}: { content?: ShelterContent } = {}) {
  const { findPage: copy, common } = content.copy
  const dem = getDemPhone(content)
  return (
    <div className="mb-l flex flex-col gap-m">
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

      <div className="border-red-80 border-l-4 bg-red-10 px-s py-xm">
        <Text as="p">
          <strong>{copy.activationHeading}</strong>{' '}
          {copy.activationIntroduction}
          {dem && (
            <>
              {' '}
              {common.phoneConnector} <Link href={dem.tel}>{dem.display}</Link>
            </>
          )}
          .
        </Text>
      </div>

      <Text as="p" className="text-grey-70">
        {formatCopy(copy.introduction, { count: content.shelters.length })}
      </Text>

      <ShelterFinder content={content} />

      <aside
        aria-labelledby="going-to-shelter-heading"
        className="flex flex-col gap-xs border-grey-20 border-t pt-m"
      >
        <Heading as="h2" id="going-to-shelter-heading" size="h3">
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
        {common.source} {copy.distanceSource}
      </Text>
    </div>
  )
}
