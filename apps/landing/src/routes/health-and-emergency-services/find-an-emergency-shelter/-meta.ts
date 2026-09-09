import type { FeatureMeta } from '../../../content/feature-meta'
import { SHELTER_CONTENT } from './-data/emergency-shelters'
import { formatCopy } from './-lib/copy'

/** Service-level metadata — discoverability only. See feature-meta.ts (no UI imports here). */
export const META = {
  url: 'health-and-emergency-services/find-an-emergency-shelter',
  title: SHELTER_CONTENT.copy.metadata.title,
  description: formatCopy(SHELTER_CONTENT.copy.metadata.description, {
    count: SHELTER_CONTENT.shelters.length,
  }),
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
