import type { Access, FieldAccess } from 'payload'

export type Role = 'admin' | 'editor'

const hasRole = (user: unknown, role: Role): boolean =>
  Boolean(user && (user as { role?: Role }).role === role)

export const isAdmin: Access = ({ req: { user } }) => hasRole(user, 'admin')

export const isAdminOrEditor: Access = ({ req: { user } }) =>
  hasRole(user, 'admin') || hasRole(user, 'editor')

/** Field-level guard: only admins may read/write the field (e.g. a user's role). */
export const isAdminFieldLevel: FieldAccess = ({ req: { user } }) => hasRole(user, 'admin')

export const anyone: Access = () => true
