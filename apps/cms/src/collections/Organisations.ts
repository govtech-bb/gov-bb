import type { CollectionConfig } from 'payload'
import { anyone, isAdminOrEditor } from '../access/roles'
import { slugField } from '../fields/slug'
import { lockSlugAfterPublish } from '../hooks/lockSlugAfterPublish'
import { contactBlocks, onlineServiceBlocks } from '../fields/contactBlocks'
import { bodyEditor } from '../lib/body-editor'

const isMinistry = (data: unknown): boolean => (data as { kind?: string })?.kind === 'ministry'

export const Organisations: CollectionConfig = {
  slug: 'organisations',
  labels: { singular: 'Organisation', plural: 'Organisations' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', '_status', 'updatedAt'],
    description: 'Ministries, departments and state bodies.',
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
    slugField('name'),
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: 'Ministry', value: 'ministry' },
        { label: 'Department', value: 'department' },
        { label: 'State body', value: 'state-body' },
      ],
      admin: { position: 'sidebar', description: 'What type of organisation this is.' },
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
        position: 'sidebar',
        description:
          'How finished this page is. Use “Migrated” only for content carried over from the old gov.bb site.',
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Overview',
          fields: [
            { name: 'name', type: 'text', required: true },
            {
              name: 'category',
              type: 'select',
              options: [
                { label: 'Ministerial', value: 'ministerial' },
                { label: 'Non-ministerial', value: 'non-ministerial' },
                { label: 'Agency', value: 'agency' },
              ],
              admin: { condition: isMinistry, description: 'How this ministry is classified.' },
            },
            {
              name: 'shortDescription',
              type: 'textarea',
              admin: {
                description:
                  'One sentence shown in organisation listings. Aim for under 160 characters — that’s roughly what search engines show in results.',
              },
            },
            {
              name: 'intro',
              type: 'textarea',
              admin: { description: 'A short introduction shown at the top of the page.' },
            },
            {
              name: 'leader',
              type: 'group',
              admin: { description: 'The minister or head of this organisation.' },
              fields: [
                { name: 'name', type: 'text' },
                { name: 'role', type: 'text' },
              ],
            },
            {
              name: 'heroImage',
              type: 'upload',
              relationTo: 'media',
              admin: { condition: isMinistry, description: 'Banner image for the ministry page.' },
            },
            {
              name: 'keywords',
              type: 'array',
              admin: { description: 'Search aliases — abbreviations and alternate names.' },
              fields: [{ name: 'value', type: 'text', required: true }],
            },
            {
              name: 'originalSource',
              type: 'text',
              label: 'Original source',
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
        {
          label: 'Contact',
          fields: [
            {
              name: 'contact',
              type: 'blocks',
              blocks: contactBlocks,
              admin: { description: 'Add a block per contact method.' },
            },
            {
              name: 'social',
              type: 'array',
              label: 'Social links',
              fields: [
                {
                  name: 'platform',
                  type: 'text',
                  required: true,
                  admin: {
                    description:
                      'Lowercase platform name: twitter, facebook, instagram, linkedin, youtube.',
                  },
                },
                { name: 'url', type: 'text', required: true },
              ],
            },
          ],
        },
        {
          label: 'Services & structure',
          fields: [
            {
              name: 'onlineServices',
              type: 'blocks',
              blocks: onlineServiceBlocks,
              admin: { description: 'Links to online services, or forms in the forms app.' },
            },
            {
              name: 'featured',
              type: 'array',
              admin: {
                condition: isMinistry,
                description: 'Highlighted tiles shown on the ministry page.',
              },
              fields: [
                { name: 'title', type: 'text', required: true },
                {
                  name: 'href',
                  type: 'text',
                  required: true,
                  admin: {
                    description:
                      'Where the tile links to: a path on this site like /apply-for-a-passport, or a full external URL.',
                  },
                },
                { name: 'description', type: 'text', required: true },
                { name: 'image', type: 'upload', relationTo: 'media' },
                { name: 'imageAlt', type: 'text' },
              ],
            },
            {
              name: 'services',
              type: 'relationship',
              relationTo: 'services',
              hasMany: true,
              admin: {
                condition: isMinistry,
                description:
                  'Services this ministry provides. Start typing to find and link a service page — its title and summary are pulled in automatically, and the link can never break.',
              },
            },
            {
              name: 'associatedDepartments',
              type: 'array',
              admin: {
                condition: isMinistry,
                description: 'Departments and bodies grouped under this ministry.',
              },
              fields: [
                {
                  name: 'category',
                  type: 'text',
                  label: 'Group heading',
                  admin: {
                    description:
                      'Optional heading to group these departments under (e.g. “Agencies”).',
                  },
                },
                {
                  name: 'items',
                  type: 'array',
                  fields: [
                    { name: 'name', type: 'text', required: true },
                    {
                      name: 'slug',
                      type: 'text',
                      admin: { description: 'Optional — slug of another organisation to link to.' },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Content',
          fields: [
            {
              name: 'body',
              type: 'richText',
              editor: bodyEditor,
              admin: {
                description:
                  'The page content. Write normally; use the block menu to insert a Callout, Show / hide, Start now button or Link button. For role-to-phone directories (and any other reference table), insert a table from the toolbar — you can have as many tables as the organisation needs.',
              },
            },
          ],
        },
      ],
    },
  ],
}
