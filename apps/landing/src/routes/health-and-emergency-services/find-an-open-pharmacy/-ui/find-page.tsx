/**
 * Pharmacy finder - page wrapper
 * --------------------------------------------------------------
 * Page body for /health-and-emergency-services/find-an-open-pharmacy/find.
 * Renders the static heading, freshness, sources and Drug Service contact,
 * and hands the interactive list off to <PharmacyFinder>.
 */

import { Heading, Link, Text } from '@govtech-bb/react'
import { format, parseISO } from 'date-fns'
import { PHARMACIES_LAST_UPDATED } from '../-data/pharmacies'
import { DRUG_SERVICE_PHONE, telHref } from '../-lib/routes'
import { PharmacyFinder } from './pharmacy-finder'

export const TITLE = 'Search for pharmacies'
export const DESCRIPTION =
  'See which pharmacies are open now anywhere in Barbados, find free or subsidised medication through the Barbados Drug Service, and filter by parish.'

export function FindOpenPharmacyPage() {
  return (
    <div className="mb-l flex flex-col gap-m">
      <div className="flex flex-col gap-xs">
        <Heading as="h1">{TITLE}</Heading>
        <div className="border-blue-10 border-b-4 pb-4">
          <Text as="p" size="body-sm">
            Last updated on {format(parseISO(PHARMACIES_LAST_UPDATED), 'PPP')}.
          </Text>
        </div>
      </div>

      <Text as="p">
        Find government and participating private pharmacies across Barbados.
        Covered medication is free at government pharmacies for eligible
        patients; participating private pharmacies charge a dispensing fee.
        Government pharmacies appear first.{' '}
        <Link href="/health-and-emergency-services/free-or-subsidised-medication">
          Check who qualifies and what to bring
        </Link>
        .
      </Text>

      <PharmacyFinder />

      <aside
        aria-labelledby="sources-heading"
        className="flex flex-col gap-xs border-grey-20 border-t pt-m"
      >
        <Heading as="h2" id="sources-heading" size="h3">
          Where this information comes from
        </Heading>
        <Text as="p">
          Pharmacy details come from the Drug Service register and published
          pharmacy information. Participation that has not been confirmed is
          labelled separately. Call before travelling to check hours, medication
          availability and costs.
        </Text>
      </aside>

      <aside
        aria-labelledby="drug-service-heading"
        className="flex flex-col gap-xs border-grey-20 border-t pt-m"
      >
        <Heading as="h2" id="drug-service-heading" size="h3">
          Drug Service
        </Heading>
        <Text as="p">
          If a pharmacy is refusing your Drug Service prescription, contact the
          Drug Service for help checking your entitlement.
        </Text>
        <Text as="p">
          Phone:{' '}
          <Link href={telHref(DRUG_SERVICE_PHONE)}>{DRUG_SERVICE_PHONE}</Link>
        </Text>
        <Text as="p">
          Email:{' '}
          <Link href="mailto:management@drugservice.gov.bb">
            management@drugservice.gov.bb
          </Link>
        </Text>
        <Text as="p">
          Website:{' '}
          <Link external href="https://drugservice.gov.bb">
            drugservice.gov.bb
          </Link>
        </Text>
        <Text as="p">Address: 6th Floor, Warrens Tower II</Text>
      </aside>
    </div>
  )
}
