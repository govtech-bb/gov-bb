# Deleting a service

2026-10-12 · `form_builder` Services flow · #3028

## Context

The Services flow had no way to remove a service. Only the legacy `/builder`
picker used `deleteForm` / `disableForm`.

## What we did

- `ServiceDelete` (in the service workbench header): **Delete service** for an
  unpublished service, after a confirmation. **Disable service** for a
  published one, reusing `useFormManagement` and `DisableModal`.
- `deleteServiceDraft` in `lib/service-drafts.ts`.

## Why we did it that way

**Agreed with the user:** delete only unpublished services, offer disable for
published ones, and never delete entry/start pages. The confirmation text says
the pages stay. Deleting pages would mean a GitHub PR through
`deleteContentPage`, which is a much bigger change.

**What "published" means.** The form is live, *or* the manifest is in Git
(`baseManifestSha !== null`, the never-published test ADR 0073 uses), *or* any
page is in Git. The library's status label wasn't usable: `serviceStatus`
calls anything with a local draft "Draft". Pages or a manifest already in Git
would also survive a local delete and reappear as a page-only row.

**Deleting has to clear everything that rebuilds the service.** That means the
service draft, its saved versions, and the content editor's autosaves
(`content-cms:draft:<path>`). The editor's autosaves list as "Draft on this
device" pages, so they would bring the service back. It also navigates away
*before* removing the draft. While the URL still points at the service, the
stale forms list would adopt it again.

**The header, not the library rows.** Each row is one big link, so a button
there would be a larger change.

## Open questions

- The dialog reads "Disable Form" (legacy component). The user chose to leave it.
- No "Enable service" in Services yet. It's still under the builder's
  "Manage form".
- None on the forms-list gap. Review (phrogwrld) caught that a failed
  `listForms` left `service.form` undefined. Delete then skipped `deleteForm`
  but still cleared the draft, so the form came back as its own row. Delete is
  now blocked while the manifest names a form whose summary isn't loaded. It
  doesn't delete by id instead, because missing metadata doesn't prove the
  form is unpublished.
