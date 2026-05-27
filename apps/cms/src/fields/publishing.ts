import type { Field } from 'payload'

// Editorial metadata shared by Services and Organisations: who owns a page and
// when it was last checked for accuracy. CMS-internal — the export script does
// not write these to the landing app, so adding them never changes the
// published content contract.

export const contentOwnerField: Field = {
  name: 'contentOwner',
  type: 'text',
  label: 'Content owner',
  admin: {
    position: 'sidebar',
    description: 'The team or person responsible for keeping this page accurate.',
  },
}

export const lastReviewedField: Field = {
  name: 'lastReviewed',
  type: 'date',
  admin: {
    position: 'sidebar',
    description: 'When someone last checked this page is still correct.',
  },
}

export const reviewByField: Field = {
  name: 'reviewBy',
  type: 'date',
  admin: {
    position: 'sidebar',
    description: 'When this page should next be checked for accuracy.',
  },
}

// Convenience bundle for collections that want the full set in the sidebar.
export const editorialFields: Field[] = [contentOwnerField, lastReviewedField, reviewByField]
