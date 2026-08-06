import type { FeatureMeta } from '../../../content/feature-meta'

/** Service-level metadata — discoverability only. See feature-meta.ts (no UI imports here). */
export const META = {
  url: 'health-and-emergency-services/water-outages',
  title: 'Check for water outages in your area',
  description:
    'See current Barbados Water Authority notices for your parish, and sign up for email alerts when the water is going to be affected near you.',
  category: 'health-and-emergency-services',
  keywords: [
    'water outage',
    'water',
    'no water',
    'burst main',
    'water disruption',
    'water alerts',
    'Barbados Water Authority',
    'BWA',
    'parish',
    'service disruption',
  ],
  visibility: 'preview',
} satisfies FeatureMeta
