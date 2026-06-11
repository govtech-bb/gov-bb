import type { FeatureMeta } from '../../content/feature-meta'

/** Service-level metadata — discoverability only. See feature-meta.ts (no UI imports here). */
export const META = {
  url: 'bank-holiday-calendar',
  title: 'Check bank holiday dates',
  description:
    'Check statutory bank holiday dates for Barbados for any year, set out under the Public Holidays Act, Cap. 352, including substitution days where a holiday falls on a weekend.',
  category: 'work-employment',
  keywords: [
    'bank holiday',
    'public holiday',
    'holidays',
    'calendar',
    'days off',
    'substitution day',
    'Public Holidays Act',
  ],
  visibility: 'public',
} satisfies FeatureMeta
