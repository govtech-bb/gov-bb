/**
 * Pharmacy finder - page wrapper
 * --------------------------------------------------------------
 * Page body for /health-and-emergency-services/find-an-open-pharmacy/find.
 * Renders the static heading, freshness, sources and Drug Service contact,
 * and hands the interactive list off to <PharmacyFinder>.
 */

import { Heading, Link, Text } from '@govtech-bb/react'
import { format, parseISO } from 'date-fns'
import type { PharmacyContent } from '../-data/pharmacies'
import { PHARMACY_CONTENT } from '../-data/pharmacies'
import { formatCopy } from '../-lib/copy'
import { telHref } from '../-lib/routes'
import { PharmacyFinder } from './pharmacy-finder'

export const TITLE = PHARMACY_CONTENT.copy.page.title
export const DESCRIPTION = PHARMACY_CONTENT.copy.page.description

export function FindOpenPharmacyPage({
  content = PHARMACY_CONTENT,
}: { content?: PharmacyContent } = {}) {
  const { page, drugService } = content.copy
  return (
    <div className="mb-l flex flex-col gap-m">
      <div className="flex flex-col gap-xs">
        <Heading as="h1">{page.title}</Heading>
        <div className="border-blue-10 border-b-4 pb-4">
          <Text as="p" size="body-sm">
            {formatCopy(page.lastUpdated, {
              date: format(parseISO(content.lastUpdated), 'PPP'),
            })}
          </Text>
        </div>
      </div>

      <Text as="p">
        {page.introduction}{' '}
        <Link href="/health-and-emergency-services/free-or-subsidised-medication">
          {page.eligibilityLinkLabel}
        </Link>
        .
      </Text>

      <PharmacyFinder content={content} />

      <aside
        aria-labelledby="sources-heading"
        className="flex flex-col gap-xs border-grey-20 border-t pt-m"
      >
        <Heading as="h2" id="sources-heading" size="h3">
          {page.sourceHeading}
        </Heading>
        <Text as="p">{page.sourceDescription}</Text>
      </aside>

      <aside
        aria-labelledby="drug-service-heading"
        className="flex flex-col gap-xs border-grey-20 border-t pt-m"
      >
        <Heading as="h2" id="drug-service-heading" size="h3">
          {drugService.heading}
        </Heading>
        <Text as="p">{drugService.description}</Text>
        <Text as="p">
          {drugService.phoneLabel}{' '}
          <Link href={telHref(drugService.phone)}>{drugService.phone}</Link>
        </Text>
        <Text as="p">
          {drugService.emailLabel}{' '}
          <Link href={`mailto:${drugService.email}`}>{drugService.email}</Link>
        </Text>
        <Text as="p">
          {drugService.websiteLabel}{' '}
          <Link external href={drugService.website}>
            {drugService.websiteLinkLabel}
          </Link>
        </Text>
        <Text as="p">
          {drugService.addressLabel} {drugService.address}
        </Text>
      </aside>
    </div>
  )
}
