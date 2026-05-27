import type { CollectionConfig } from 'payload'
import { anyone, isAdminOrEditor } from '../access/roles'
import { slugField } from '../fields/slug'
import { contactBlocks, onlineServiceBlocks } from '../fields/contactBlocks'

const isMinistry = (data: unknown): boolean => (data as { kind?: string })?.kind === 'ministry'

export const Organisations: CollectionConfig = {
  slug: 'organisations',
  labels: { singular: 'Organisation', plural: 'Organisations' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', 'updatedAt'],
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
              admin: { description: 'One sentence shown in organisation listings.' },
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
              admin: { description: 'The original gov.bb page, if any.' },
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
                { name: 'href', type: 'text', required: true },
                { name: 'description', type: 'text', required: true },
                { name: 'image', type: 'upload', relationTo: 'media' },
                { name: 'imageAlt', type: 'text' },
              ],
            },
            {
              name: 'services',
              type: 'array',
              admin: { condition: isMinistry, description: 'Services this ministry provides.' },
              fields: [
                { name: 'title', type: 'text', required: true },
                { name: 'href', type: 'text', required: true },
                { name: 'description', type: 'text' },
              ],
            },
            {
              name: 'associatedDepartments',
              type: 'array',
              admin: { description: 'Departments and bodies grouped under this organisation.' },
              fields: [
                {
                  name: 'category',
                  type: 'text',
                  admin: { description: 'Optional group heading.' },
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
              type: 'textarea',
              admin: {
                description:
                  'Page content in Markdown. To add a "Start now" button, put `<a data-start-link>Start now</a>` on its own line.',
                rows: 20,
              },
            },
            {
              name: 'bodyPreview',
              type: 'ui',
              admin: { components: { Field: '/components/MarkdownPreview#MarkdownPreview' } },
            },
            { name: 'bodyLexical', type: 'richText', admin: { hidden: true } },
          ],
        },
      ],
    },
  ],
}
