import type { CollectionConfig } from 'payload'
import { anyone, isAdminOrEditor } from '../access/roles'
import { slugField } from '../fields/slug'
import { flagField } from '../fields/flag'
import { lockSlugAfterPublish } from '../hooks/lockSlugAfterPublish'
import { bodyEditor } from '../lib/body-editor'

export const Services: CollectionConfig = {
  slug: 'services',
  labels: { singular: 'Service / Guide', plural: 'Services & Guides' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', '_status', 'categories', 'stage', 'updatedAt'],
    description:
      'Service and guide pages shown to the public. An Entry page describes a service and appears in listings; a digital service has a Start now button in its body pointing at the online form. A Start page (set Page role to “Start”, slug ending /start) is a sub-page of an entry page holding form-start content — it is excluded from listings automatically.',
    group: 'Content',
  },
  access: {
    read: anyone,
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
      name: 'pageRole',
      type: 'select',
      required: true,
      defaultValue: 'entry',
      options: [
        { label: 'Entry page (listed, has description)', value: 'entry' },
        { label: 'Start page (sub-page, not listed)', value: 'start' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Entry pages appear in category and service listings. Start pages are sub-pages reached from an entry page (slug ending /start) and are excluded from listings.',
      },
    },
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
              // Required for top-level service pages (which appear in listings and
              // search), but not for sub-pages like `service-name/start`, which
              // have no standalone listing. Enforced at publish — drafts skip it.
              validate: (
                value: string | null | undefined,
                { data }: { data?: { pageRole?: string | null } },
              ) => {
                const isStartPage = data?.pageRole === 'start'
                if (!value && !isStartPage)
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
                  'The page content. Write normally; use the block menu to insert a Callout, Show / hide, Start now button or Link button.',
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
              name: 'serviceType',
              type: 'select',
              required: true,
              defaultValue: 'information',
              options: [
                { label: 'Digital (has an online form)', value: 'digital' },
                { label: 'Information only', value: 'information' },
              ],
              admin: {
                description:
                  'Choose “Digital” if the service has an online form authors can link to from a Start now button; otherwise leave as “Information only”.',
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
