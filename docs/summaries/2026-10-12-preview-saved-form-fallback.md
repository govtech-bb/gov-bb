# Preview saved form fallback

2026-10-12 · `form_builder` Services preview · #3029

## Context

The Services preview's form section always showed "Preview unavailable". It
iframes the forms app's `/preview-service` and waits up to 7 s for a `ready`
message. No such route exists in `apps/forms`, and `VITE_FORMS_PREVIEW_URL`
isn't set anywhere. The legacy builder never needed this. It linked to the
*saved* draft on the real forms app in a new tab (`formPreviewUrl`).

## What we did

- The unavailable panel offers **Preview saved form** for the form section,
  through a new `savedFormId` prop on `ServicePreview` / `ServicePreviewBody`.
- Callers pass it in:
  - workbench and content editor: `recipe ? formId : null`
  - legacy builder: `loadedFromId`
  - AI proposal pane: nothing.

## Why we did it that way

**Quick fix, chosen by the user.** It covers the gap without building the
forms receiver (option 1 in the issue). The link opens the last *saved*
version (`?draft=<token>`, submission blocked), so it can lag behind unsaved
edits. The panel text says so.

**"Saved" comes from the caller.** The preview component has no reliable
signal of its own. Services snapshots load their recipe on the server, from
the DB draft or the published recipe. The legacy builder's snapshot is built
in memory, so it uses the same `loadedFromId` check as its old link. AI
proposals are unsaved, so they get no link.

## Open questions

- Live draft preview still needs a forms `/preview-service` receiver and
  `VITE_FORMS_PREVIEW_URL`. That's tracked as a follow-up issue.
