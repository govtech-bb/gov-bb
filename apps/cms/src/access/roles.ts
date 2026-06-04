import type { Access, FieldAccess } from 'payload'

export type Role = 'admin' | 'editor'

const hasRole = (user: unknown, role: Role): boolean =>
  Boolean(user && (user as { role?: Role }).role === role)

export const isAdmin: Access = ({ req: { user } }) => hasRole(user, 'admin')

export const isAdminOrEditor: Access = ({ req: { user } }) =>
  hasRole(user, 'admin') || hasRole(user, 'editor')

/**
 * Used on the Users collection's read access: admins see everything, any
 * other logged-in user sees only their own row, unauthenticated callers see
 * nothing. Without this, /api/users would leak the editor roster.
 */
export const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (hasRole(user, 'admin')) return true
  return { id: { equals: user.id } }
}

/** Field-level guard: only admins may read/write the field (e.g. a user's role). */
export const isAdminFieldLevel: FieldAccess = ({ req: { user } }) => hasRole(user, 'admin')

export const anyone: Access = () => true

/**
 * Public read access for content collections. Logged-in users (admin/editor)
 * see everything, including drafts; anonymous callers are constrained to
 * published documents. Without this, the open REST/GraphQL API serves
 * unpublished autosaved drafts to anyone passing `?draft=true`.
 *
 * Flagged-but-published docs are intentionally still returned: the landing
 * site applies the `flag=live` filter itself, and omits it for reviewers
 * holding the FLAG_SECRET cookie (and to surface 503 for flagged pages).
 */
export const publishedOnly: Access = ({ req: { user } }) =>
  user ? true : { _status: { equals: 'published' } }
