import type { FeatureMeta } from '../../../content/feature-meta'

/** Service-level metadata — discoverability only. See feature-meta.ts (no UI imports here). */
export const META = {
  url: 'health-and-emergency-services/find-an-emergency-shelter',
  title: 'Find an emergency shelter',
  description:
    'Search all 70 emergency shelters in Barbados to use during a hurricane or tropical storm. Filter by parish, category and accessibility, and read what to bring before you go.',
  category: 'health-and-emergency-services',
  keywords: [
    'shelter',
    'emergency shelter',
    'hurricane',
    'storm',
    'evacuation',
    'DEM',
    'Department of Emergency Management',
    'parish',
    'Go Bag',
    'warden',
    'disaster',
  ],
  visibility: 'public',
} satisfies FeatureMeta
