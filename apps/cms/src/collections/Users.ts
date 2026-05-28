import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminFieldLevel, isAdminOrSelf } from '../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role'],
  },
  auth: {
    // Secure cookies in production (requires the admin to be served over
    // HTTPS); allow insecure cookies in local dev so the admin works on
    // http://localhost.
    cookies: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
    },
    // Lock out an account after repeated failed logins.
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000, // 10 minutes
  },
  access: {
    // Without an explicit read rule Payload defaults to public, which would
    // leak the editor roster via /api/users. Admins see everything; any
    // other logged-in user sees only their own row.
    read: isAdminOrSelf,
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
