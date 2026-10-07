/**
 * schema.org/Pharmacy JSON-LD for a detail page - built from the same
 * structured records the page renders, nothing invented. Pure; the caller
 * supplies the canonical URL.
 */

import type { Pharmacy } from '../-data/pharmacies'
import { phoneE164 } from './routes'

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
  }
}
