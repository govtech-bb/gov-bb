import type { CollectionConfig } from 'payload'
import { anyone, isAdminOrEditor } from '../access/roles'
import { slugField } from '../fields/slug'
import { editorialFields } from '../fields/publishing'
import { lockSlugAfterPublish } from '../hooks/lockSlugAfterPublish'
import { contactBlocks, onlineServiceBlocks } from '../fields/contactBlocks'
import { bodyEditor } from '../lib/body-editor'

const isMinistry = (data: unknown): boolean => (data as { kind?: string })?.kind === 'ministry'

export const Organisations: CollectionConfig = {
  slug: 'organisations',
  labels: { singular: 'Organisation', plural: 'Organisations' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', '_status', 'reviewBy', 'updatedAt'],
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
    ...editorialFields,
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
                { name: 'photo', type: 'upload', relationTo: 'media' },
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
              admin: {
                description: 'Only fill this in if the page was copied from the old gov.bb site.',
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
              admin: { description: 'Departments and bodies grouped under this organisation.' },
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
                  'The page content. Write normally; use the block menu to insert a Callout, Show / hide, Start now button or Link button.',
              },
            },
          ],
        },
      ],
    },
  ],
}
