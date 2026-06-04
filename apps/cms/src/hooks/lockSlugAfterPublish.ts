import type { CollectionBeforeChangeHook } from 'payload'

// Protects live URLs: once a page is live, a non-admin can't change its slug.
// Enforced at the publish action (data._status === 'published') against the
// currently-live slug, so it catches every re-publish of a live doc — not just
// the first one. Autosave drafts (_status === 'draft') never trip it, avoiding
// the Payload "Something went wrong" thrash. The first publish is free to set
// any slug (the doc wasn't live yet). Admins may change a live slug.
export const lockSlugAfterPublish: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const isPublishAction = data?._status === 'published'
  const wasLive = originalDoc?._status === 'published'
  const slugChanged = data?.slug && originalDoc?.slug && data.slug !== originalDoc.slug
  const isAdmin = (req?.user as { role?: string } | undefined)?.role === 'admin'

  if (isPublishAction && wasLive && slugChanged && !isAdmin) {
    throw new Error(
      `This page is live at “${originalDoc.slug}”. Changing its web address breaks existing links — ask an admin to make this change.`,
    )
  }

  return data
}
