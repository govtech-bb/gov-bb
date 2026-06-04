import type { Field } from 'payload'

// Slugs may be hierarchical (e.g. `calculate-severance-pay/start` for a service
// sub-page); `/` is preserved as a path separator and each segment slugified.
export const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .split('/')
    .map((segment) => segment.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('/')

/**
 * URL slug, auto-filled from `title` only when left blank, so existing slugs
 * (and the page URLs built from them) stay stable across edits. Once a page is
 * published the slug is locked for editors — changing a live URL breaks every
 * existing link to it — and only an admin may change it.
 */
export const slugField = (sourceField = 'title'): Field => ({
  name: 'slug',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  admin: {
    position: 'sidebar',
    description:
      'The web address for this page. Leave blank and it fills in from the title. Once the page is live this is locked — changing it breaks every existing link, so ask an admin if it really must change.',
  },
  hooks: {
    beforeValidate: [
      ({ value, data }) => {
        if (value) return slugify(String(value))
        const source = data?.[sourceField]
        return source ? slugify(String(source)) : value
      },
    ],
  },
})
