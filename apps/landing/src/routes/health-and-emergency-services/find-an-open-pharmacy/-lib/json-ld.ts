/**
 * schema.org/Pharmacy JSON-LD for a detail page - built from the same
 * structured records the page renders, nothing invented. Pure; the caller
 * supplies the canonical URL.
 */

import type { Pharmacy, TimeRange, Weekday } from '../-data/pharmacies'
import { WEEKDAYS } from '../-data/pharmacies'
import { phoneE164 } from './routes'

const SCHEMA_DAYS = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
} satisfies Record<Weekday, string>

function openingHoursSpecification(
  hours: Readonly<Record<Weekday, ReadonlyArray<TimeRange>>>,
) {
  return WEEKDAYS.flatMap((weekday) =>
    hours[weekday].map((range) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: SCHEMA_DAYS[weekday],
      opens: range.opens,
      // schema.org has no '24:00'; the last indexable minute stands in.
      closes: range.closes === '24:00' ? '23:59' : range.closes,
    })),
  )
}

export function pharmacyJsonLd(pharmacy: Pharmacy, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Pharmacy',
    name: pharmacy.name,
    url,
    address: {
      '@type': 'PostalAddress',
      streetAddress: pharmacy.address,
      ...(pharmacy.parish !== 'All parishes' && {
        addressRegion: pharmacy.parish,
      }),
      addressCountry: 'BB',
    },
    ...(pharmacy.phone && { telephone: phoneE164(pharmacy.phone) }),
    ...(pharmacy.coords && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: pharmacy.coords.lat,
        longitude: pharmacy.coords.lon,
      },
    }),
    ...(pharmacy.hours && {
      openingHoursSpecification: openingHoursSpecification(pharmacy.hours),
    }),
  }
}
