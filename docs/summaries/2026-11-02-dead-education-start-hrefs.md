# Dead education Start links (#3260)

## Context

Seven draft education pages (authored in #552) had Start links to
`/education/<slug>/start`, but no matching `start.md` existed, so each button
404'd. The pages are draft, but their `disabled` service_status rows already
show them to preview reviewers on sandbox, and the estate import copies the
markdown into api_v2 as-is. So the dead links would have reached every
environment.

## What we did

- Removed the `href` from the `<a data-start-link>` anchor on all 7 pages.
- `registry.test.ts`: added the school uniform grant to the #911 Group A list,
  and added a check that every Start link ending in `/start` points at a page
  that `findPage` can find.

## Why we did it that way

- **The uniform grant page is a real fix.** It already had
  `form_id: school-uniform-grant-barbados`, but `bakeStartLinkFormId` and
  `StartLink` both use an authored href before `form_id`, so the form_id was
  never used. Removing the href lets the build attach the form id, the same
  way PR #1358 fixed the Group A pages.
- **The other six keep an empty anchor.** They have no form (#911 was closed
  NOT_PLANNED while the Ministry's requirements are pending). An empty
  `<a data-start-link>` renders nothing, and it is where a future `form_id`
  goes. We rejected deleting the anchor and the "online form" sentence because
  that is content editing on parked pages. The copy belongs to the owner.
- **We fixed the markdown, not `estate.json`.** The snapshot is generated from
  the markdown by CI, so a hand edit would be overwritten. The fix reaches
  `v2-rewrite` with the next merge from `main` (#3234 checks this before it
  runs).
- **The check only looks at hrefs ending in `/start`.** `/form` and `/find` are
  TanStack routes, not markdown pages, so `findPage` would wrongly flag them.
  The check stops mattering after the content freeze (#3236). Until then it
  stops the v1 form builder from adding this bug back.

## Open questions

- The six pages without a form still say "You can complete the online form"
  with no button. That wording waits for the Ministry's requirements and
  belongs to the owner (sajclarke).
