import type { CollectionConfig } from 'payload'
import { publishedOnly, isAdminOrEditor } from '../access/roles'
import { slugField } from '../fields/slug'
import { flagField } from '../fields/flag'
import { lockSlugAfterPublish } from '../hooks/lockSlugAfterPublish'
import { bodyEditor } from '../lib/body-editor'

// A service is ONE document. The Content tab is the guide page. The Start page
// tab makes it a digital service: it carries a start action (the "Start now"
// button) — a Form Builder form, or a link to a calculator/another site — plus
// optional "before you start" content rendered at <slug>/start. A service is
// digital because it has a start action, not because it has a form.
const startTypeIs = (siblingData: unknown, value: string): boolean =>
  (siblingData as { startType?: string })?.startType === value

export const Services: CollectionConfig = {
  slug: 'services',
  labels: { singular: 'Service / Guide', plural: 'Services & Guides' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', '_status', 'categories', 'stage', 'updatedAt'],
    description:
      'Service and guide pages shown to the public. One document per service: the Content tab is the page itself; the Start page tab makes it a digital service (a Start now button to a form, calculator or other site). The buttons are generated automatically.',
    group: 'Content',
  },
  access: {
    read: publishedOnly,
    readVersions: isAdminOrEditor,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  versions: { drafts: { autosave: true } },
  hooks: {
    beforeChange: [lockSlugAfterPublish],
  },
  fields: [
    slugField(),
    flagField,
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
              validate: (value: string | null | undefined) => {
                if (!value)
                  return 'Add a short summary — it appears in search results and listings.'
                return true
              },
              admin: {
                description:
                  'A one-sentence summary, shown in search results and listings. Aim for under 160 characters — that’s roughly what search engines show in results.',
              },
            },
            {
              name: 'body',
              type: 'richText',
              editor: bodyEditor,
              admin: {
                description:
                  'The page content. Write normally; use the block menu to insert a Callout, Show / hide, or Button.',
              },
            },
          ],
        },
        {
          label: 'Start page',
          description:
            'Fill this in for a digital service. The “Start now” button is generated from the start action below; add optional start-page content shown before it at <slug>/start. Leave blank for an information-only page.',
          fields: [
            {
              name: 'startType',
              type: 'select',
              options: [
                { label: 'Form Builder form', value: 'form' },
                { label: 'Link (calculator, another site, etc.)', value: 'link' },
              ],
              admin: {
                description:
                  'How the service starts. Leave blank for an information-only page (no Start now button).',
              },
            },
            {
              name: 'formId',
              type: 'text',
              admin: {
                description: 'The form’s ID from Form Builder. The Start now button links to it.',
                condition: (_, siblingData) => startTypeIs(siblingData, 'form'),
              },
              validate: (
                value: string | null | undefined,
                { siblingData }: { siblingData?: Record<string, unknown> },
              ) =>
                startTypeIs(siblingData, 'form') && !value
                  ? 'Add the form ID, or change the start type.'
                  : true,
            },
            {
              name: 'startUrl',
              type: 'text',
              admin: {
                description:
                  'Where Start now links — a path on this site (e.g. /money-financial-support/calculate-severance-pay/form) or a full external URL.',
                condition: (_, siblingData) => startTypeIs(siblingData, 'link'),
              },
              validate: (
                value: string | null | undefined,
                { siblingData }: { siblingData?: Record<string, unknown> },
              ) =>
                startTypeIs(siblingData, 'link') && !value
                  ? 'Add the link target, or change the start type.'
                  : true,
            },
            {
              name: 'startBody',
              type: 'richText',
              editor: bodyEditor,
              admin: {
                description:
                  'Optional “before you start” content (what you’ll need, how long it takes), shown at <slug>/start above the Start now button.',
              },
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
              name: 'stage',
              type: 'select',
              label: 'Stage',
              required: true,
              options: [
                { label: 'Alpha', value: 'alpha' },
                { label: 'Beta', value: 'beta' },
                { label: 'Migrated', value: 'migrated' },
              ],
              defaultValue: 'alpha',
              admin: {
                description:
                  'How finished this page is. New pages start at Alpha. Use “Migrated” only for content carried over from the old gov.bb site.',
              },
            },
            {
              name: 'sourceUrl',
              type: 'text',
              admin: {
                description: 'The original gov.bb page this migrated content came from.',
                // Only relevant for migrated content — hidden otherwise.
                condition: (_, siblingData) => siblingData?.stage === 'migrated',
              },
              validate: (
                value: string | null | undefined,
                { siblingData }: { siblingData?: Record<string, unknown> },
              ) => {
                const isMigrated = siblingData?.stage === 'migrated'
                if (!value)
                  return isMigrated ? 'Add the original gov.bb URL for migrated content.' : true
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
          ],
        },
      ],
    },
  ],
}
