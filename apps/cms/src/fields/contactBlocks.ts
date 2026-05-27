// These block `slug`s are matched by string in src/lib/frontmatter-map.ts on
// export. Renaming one here without updating the mapper breaks that mapping —
// the contract test uses fixtures and won't catch it.
import type { Block } from 'payload'

const labelField = {
  name: 'label',
  type: 'text' as const,
  admin: {
    description: 'Shown beside the value, e.g. "Main office" or "Permanent Secretary".',
  },
}

export const PhoneBlock: Block = {
  slug: 'phone',
  labels: { singular: 'Phone', plural: 'Phones' },
  fields: [
    labelField,
    { name: 'value', type: 'text', required: true, admin: { placeholder: '(246) 535-5100' } },
  ],
}

export const EmailBlock: Block = {
  slug: 'email',
  labels: { singular: 'Email', plural: 'Emails' },
  fields: [
    labelField,
    { name: 'value', type: 'text', required: true, admin: { placeholder: 'info@ministry.gov.bb' } },
  ],
}

export const WebsiteBlock: Block = {
  slug: 'website',
  labels: { singular: 'Website', plural: 'Websites' },
  fields: [
    labelField,
    {
      name: 'value',
      type: 'text',
      required: true,
      admin: { placeholder: 'https://ministry.gov.bb' },
    },
    {
      name: 'display',
      type: 'text',
      admin: { description: 'Optional friendly text to show instead of the raw URL.' },
    },
  ],
}

export const AddressBlock: Block = {
  slug: 'address',
  labels: { singular: 'Address', plural: 'Addresses' },
  fields: [
    labelField,
    {
      name: 'lines',
      type: 'textarea',
      required: true,
      admin: { description: 'One line per row — building, street, parish, country.' },
    },
  ],
}

export const contactBlocks = [PhoneBlock, EmailBlock, WebsiteBlock, AddressBlock]

export const LinkServiceBlock: Block = {
  slug: 'linkService',
  labels: { singular: 'Link', plural: 'Links' },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'href',
      type: 'text',
      required: true,
      admin: { description: 'A site path like /apply-for-a-passport, or a full external URL.' },
    },
    { name: 'description', type: 'text' },
  ],
}

export const FormServiceBlock: Block = {
  slug: 'formService',
  labels: { singular: 'Form', plural: 'Forms' },
  fields: [
    {
      name: 'formId',
      type: 'text',
      required: true,
      admin: { description: 'The form ID from the forms app.' },
    },
    { name: 'label', type: 'text' },
  ],
}

export const onlineServiceBlocks = [LinkServiceBlock, FormServiceBlock]
