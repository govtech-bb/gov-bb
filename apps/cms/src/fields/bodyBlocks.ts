// Blocks embedded in the Lexical body editor (see src/lib/body-editor.ts).
// `slug` is the blockType the landing Lexical renderer keys on — renaming one
// here without updating apps/landing's LexicalContent converters breaks render.
import type { Block } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { withoutExcludedFeatures } from '../lib/editor-features'

// Nested editor for block content: same trimmed toolbar as the page body (no
// indent/align/checklist/inline-code/blockquote), no nested BlocksFeature.
const nestedEditor = lexicalEditor({
  features: ({ defaultFeatures }) => withoutExcludedFeatures(defaultFeatures),
})

export const CalloutBlock: Block = {
  slug: 'callout',
  labels: { singular: 'Callout', plural: 'Callouts' },
  fields: [
    {
      name: 'variant',
      type: 'select',
      defaultValue: 'information',
      options: [
        { label: 'Information', value: 'information' },
        { label: 'Warning', value: 'warning' },
      ],
    },
    { name: 'content', type: 'richText', editor: nestedEditor, required: true },
  ],
}

export const ShowHideBlock: Block = {
  slug: 'showHide',
  labels: { singular: 'Show / hide', plural: 'Show / hide' },
  fields: [
    {
      name: 'summary',
      type: 'text',
      required: true,
      admin: { description: 'The always-visible label.' },
    },
    { name: 'content', type: 'richText', editor: nestedEditor, required: true },
  ],
}

export const StartButtonBlock: Block = {
  slug: 'startButton',
  labels: { singular: 'Button', plural: 'Buttons' },
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'form',
      admin: {
        description:
          'Form links to an online form — it adds start analytics and stays hidden until the form is live. Page or External URL is a plain link styled as a button.',
      },
      options: [
        { label: 'Form', value: 'form' },
        { label: 'Page on this site', value: 'page' },
        { label: 'External URL', value: 'url' },
      ],
    },
    {
      name: 'formId',
      type: 'text',
      admin: {
        description:
          'The form’s ID from Form Builder (the apps/form_builder admin). Open the form there; the ID is in the URL and on the form’s settings page.',
        condition: (_, siblingData) => siblingData?.type === 'form',
      },
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        description: 'Target path (must start with /) or full URL.',
        condition: (_, siblingData) => siblingData?.type === 'page' || siblingData?.type === 'url',
      },
    },
    {
      name: 'label',
      type: 'text',
      admin: { description: 'Button label. Defaults to "Start now".' },
    },
  ],
}

export const bodyBlocks = [CalloutBlock, ShowHideBlock, StartButtonBlock]
