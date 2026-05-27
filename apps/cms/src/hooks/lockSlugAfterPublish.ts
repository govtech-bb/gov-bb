import type { CollectionBeforeChangeHook } from 'payload'

// Protects live URLs: once a page is published, its slug can't be changed by a
// non-admin. The check fires only on the draft→published transition, so the slug
// stays freely editable while drafting and autosave never trips it (avoids the
// Payload "Something went wrong" autosave thrash). Admins may change a live slug.
export const lockSlugAfterPublish: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const publishing = data?._status === 'published' && originalDoc?._status !== 'published'
  const slugChanged = data?.slug && originalDoc?.slug && data.slug !== originalDoc.slug
  const isAdmin = (req?.user as { role?: string } | undefined)?.role === 'admin'

  if (publishing && slugChanged && !isAdmin) {
    throw new Error(
      `This page is live at “${originalDoc.slug}”. Changing its web address breaks existing links — ask an admin to make this change.`,
    )
  }

  return data
}
