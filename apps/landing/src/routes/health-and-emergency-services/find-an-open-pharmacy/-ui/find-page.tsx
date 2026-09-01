/**
 * Pharmacy finder — page wrapper
 * --------------------------------------------------------------
 * Page body for /health-and-emergency-services/find-an-open-pharmacy/find.
 * Renders the static heading, freshness, sources and Drug Service contact,
 * and hands the interactive list off to <PharmacyFinder>.
 */

import { Heading, Link, Text } from '@govtech-bb/react'
import { format, parseISO } from 'date-fns'
import {
  PHARMACIES_LAST_UPDATED,
  PHARMACIES_NEXT_REVIEW,
} from '../-data/pharmacies'
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
        <div className="border-blue-10 border-b-4 pb-4 text-mid-grey-00">
          <Text as="p" size="body-sm">
            Last updated on {format(parseISO(PHARMACIES_LAST_UPDATED), 'PPP')}.
            Next review: {format(parseISO(PHARMACIES_NEXT_REVIEW), 'PPP')}.
          </Text>
        </div>
      </div>

      <Text as="p" className="text-mid-grey-00">
        Pharmacies that give free or cheaper prescription medication across
        Barbados. Government polyclinic pharmacies are free; private
        pharmacies in the Drug Service subsidy charge a small dispensing fee.
        Set your prescription colour to hide the pharmacies that cannot
        fill it.
      </Text>

      <PharmacyFinder />

      <aside
        aria-labelledby="sources-heading"
        className="flex flex-col gap-xs border-grey-00 border-t pt-m"
      >
        <Heading as="h2" id="sources-heading" size="h3">
          Where this information comes from
        </Heading>
        <Text as="p" className="text-mid-grey-00">
          Government pharmacies come from the Drug Service register, verified
          May 2026. Pharmacies marked “Small fee” are on the Drug Service
          Active PPP list, supplied August 2026. Pharmacies marked “Full
          price” are not on that list, so the Drug Service subsidy does not
          apply there. Opening hours and Drug Service participation can change
          — call ahead to confirm.
        </Text>
      </aside>

      <aside
        aria-labelledby="drug-service-heading"
        className="flex flex-col gap-xs border-grey-00 border-t pt-m"
      >
        <Heading as="h2" id="drug-service-heading" size="h3">
          Drug Service
        </Heading>
        <Text as="p">
          If a pharmacy is refusing your Drug Service prescription, contact
          the Drug Service before you pay — do not pay full price on the
          assumption the refusal is correct.
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
