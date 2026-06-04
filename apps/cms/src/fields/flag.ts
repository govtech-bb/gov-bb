// Shared "feature flag" field used on Services and Organisations.
//
// "Live" docs are visible to the public on the landing site. "Flagged" docs
// are hidden from the public — only visible to reviewers who present the
// FLAG_SECRET token (sets a cookie; landing's runtime CMS queries then
// include flagged docs for that session).
//
// Authors flip from Flagged → Live when ready to release; from Live →
// Flagged to pull a doc back behind the gate without unpublishing.

import type { Field } from 'payload'

export const flagField: Field = {
  name: 'flag',
  type: 'select',
  required: true,
  defaultValue: 'live',
  options: [
    { label: 'Live — visible to the public', value: 'live' },
    { label: 'Flagged — hidden behind a feature flag', value: 'flagged' },
  ],
  admin: {
    position: 'sidebar',
    description:
      'Set to “Flagged” while preparing — the page is hidden from the public and only visible to reviewers with the feature-flag cookie. Switch to “Live” when ready to release.',
  },
}
