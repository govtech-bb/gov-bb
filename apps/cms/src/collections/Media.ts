import type { CollectionConfig } from 'payload'
import { anyone, isAdminOrEditor } from '../access/roles'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: anyone,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdminOrEditor,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: { description: "Describes the image for screen readers and when it can't load." },
    },
    {
      name: 'caption',
      type: 'text',
      admin: { description: 'Optional caption shown beneath the image.' },
    },
    {
      name: 'credit',
      type: 'text',
      admin: { description: 'Optional photographer or source credit.' },
    },
  ],
  upload: true,
}
