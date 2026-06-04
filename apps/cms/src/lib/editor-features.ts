// Editor features a content designer never needs, or that render to nothing on
// the published page. Dropped from every Lexical editor instance — the page
// body, the nested block-content editors, and the default fallback editor — so
// the toolbar is consistent wherever an author types. Kept in its own module so
// both body-editor.ts and bodyBlocks.ts can share it without a circular import.

import type { FeatureProviderServer } from '@payloadcms/richtext-lexical'

export const EXCLUDED_FEATURES = new Set([
  'strikethrough',
  'subscript',
  'superscript',
  'indent',
  'align',
  'checklist',
  'inlineCode',
  'blockquote',
])

export const withoutExcludedFeatures = (
  defaultFeatures: FeatureProviderServer[],
): FeatureProviderServer[] =>
  defaultFeatures.filter((feature) => !EXCLUDED_FEATURES.has(feature.key))
