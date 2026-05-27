import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminFieldLevel } from '../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role'],
  },
  auth: true,
  access: {
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      admin: { description: "The person's name, shown in the users list." },
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      saveToJWT: true,
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
      ],
      access: {
        update: isAdminFieldLevel,
      },
      admin: { description: 'Admins manage users and taxonomy. Editors create and edit content.' },
    },
  ],
}
