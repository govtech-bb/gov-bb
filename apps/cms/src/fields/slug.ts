import type { Field } from 'payload'

export const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * URL slug, auto-filled from `title` only when left blank, so existing slugs
 * (and the page URLs built from them) stay stable across edits.
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
      'URL id for this page. Leave blank to fill from the title. Changing it changes the page URL.',
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
