import type { CollectionConfig } from 'payload'
import { anyone, isAdminOrEditor } from '../access/roles'
import { slugField } from '../fields/slug'

export const Services: CollectionConfig = {
  slug: 'services',
  labels: { singular: 'Service / Guide', plural: 'Services & Guides' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'categories', 'stage', 'updatedAt'],
    description:
      'Service and guide pages shown to the public on the site. Some services have sub-pages with a slashed slug like service-name/start — edit the main page for its description and listings, and the sub-page for the form-start content.',
    group: 'Content',
  },
  access: {
    read: anyone,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  versions: { drafts: { autosave: true } },
  fields: [
    slugField(),
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'title', type: 'text', required: true },
            {
              name: 'description',
              type: 'textarea',
              admin: { description: 'A short summary. Shown in search results and listings.' },
            },
            {
              name: 'body',
              type: 'textarea',
              admin: {
                description:
                  'The page content, written in Markdown. To add a "Start now" button, put `<a data-start-link>Start now</a>` on its own line — it links to the form set by Form ID on the Details tab.',
                rows: 20,
              },
            },
            {
              name: 'bodyPreview',
              type: 'ui',
              admin: { components: { Field: '/components/MarkdownPreview#MarkdownPreview' } },
            },
            {
              name: 'bodyLexical',
              type: 'richText',
              admin: { hidden: true },
            },
          ],
        },
        {
          label: 'Details',
          fields: [
            {
              name: 'categories',
              type: 'relationship',
              relationTo: 'categories',
              hasMany: true,
              admin: { description: 'Which categories this page is listed under.' },
            },
            {
              name: 'subcategory',
              type: 'relationship',
              relationTo: 'subcategories',
              admin: {
                description:
                  'Optional. Choose categories first — only subcategories of those categories are offered.',
              },
              filterOptions: ({ data }) => {
                // `data.categories` holds category IDs and `Subcategories.parent`
                // stores a category ID, so this id-to-id match is intentional.
                const cats = (data as { categories?: unknown })?.categories
                if (!Array.isArray(cats) || cats.length === 0) return false
                return { parent: { in: cats } }
              },
            },
            {
              name: 'serviceType',
              type: 'select',
              options: [
                { label: 'Digital (has an online form)', value: 'digital' },
                { label: 'Information only', value: 'information' },
              ],
            },
            {
              name: 'stage',
              type: 'select',
              options: [{ label: 'Alpha', value: 'alpha' }],
              defaultValue: 'alpha',
            },
            {
              name: 'featured',
              type: 'checkbox',
              defaultValue: false,
              admin: { description: 'Promote this service in featured listings on the site.' },
            },
            {
              name: 'section',
              type: 'text',
              admin: {
                description: 'Optional heading this service appears under in some listings.',
              },
            },
            {
              name: 'formId',
              type: 'text',
              admin: {
                description: 'Links the in-page "Start now" button to a form in the forms app.',
              },
            },
            {
              name: 'sourceUrl',
              type: 'text',
              admin: { description: 'The original gov.bb page this content came from, if any.' },
              validate: (value: string | null | undefined) => {
                if (!value) return true
                try {
                  const { protocol } = new URL(value)
                  if (protocol !== 'http:' && protocol !== 'https:') {
                    return 'Must be an http or https URL.'
                  }
                  return true
                } catch {
                  return 'Enter a full URL, e.g. https://www.gov.bb/…'
                }
              },
            },
            { name: 'publishDate', type: 'date' },
          ],
        },
      ],
    },
  ],
}
