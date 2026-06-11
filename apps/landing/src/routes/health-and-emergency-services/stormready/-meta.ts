import type { FeatureMeta } from '../../../content/feature-meta'

/** Service-level metadata — discoverability only. See feature-meta.ts (no UI imports here). */
export const META = {
  url: 'health-and-emergency-services/stormready',
  title: 'StormReady Barbados',
  description:
    'Get ready for hurricane season with a household preparation checklist and key contacts, and stay up to date with Department of Emergency Management (DEM) alerts.',
  category: 'health-and-emergency-services',
  keywords: [
    'hurricane',
    'storm',
    'hurricane season',
    'emergency',
    'DEM',
    'Department of Emergency Management',
    'disaster',
    'preparedness',
    'checklist',
    'shelter',
    'evacuation',
  ],
  visibility: 'public',
} satisfies FeatureMeta
