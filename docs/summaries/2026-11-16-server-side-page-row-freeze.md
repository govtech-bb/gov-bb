# feature_flagging refuses page-row status writes after cutover (#3465)

## Context

#3248 (PR #3467) stopped feature_flagging offering a status select on rows without a form once `EDITOR_V2_URL` is set, but only in the UI. The `setServiceStatus` server function still accepted any slug, so a stale tab or a hand-crafted call could change a page row and, with it, what a rollback (#3225) restores.

## What we did

- `app/server/service-status.ts`: moved `listServices`' body into a plain `loadCatalogue(token)`. When `pagesInEditor` is set, `setServiceStatus` rebuilds the catalogue, finds the row by slug and throws before the PUT when the row is missing or `statusEditable(row, true)` is false.
- `service-status.spec.ts`: a getter mock over a hoisted flag for `pagesInEditor`, a refusal spec for content-only, orphan and unknown slugs, write specs for form rows, a fail-closed spec, and a no-lookup spec for the flag off.
- ADR 0110's "After cutover" consequence and the README's cutover paragraph now say the server refuses these writes.

## Why we did it that way

- **Rebuild the whole catalogue rather than check `slug ∈ /form-definitions`.** One GET instead of three, but it answers differently from `statusEditable` for a landing page whose `formId` has no recipe yet. Reusing the UI's rule means the two can't drift.
- **Refuse a slug that's in no list.** Before cutover that write creates a new row. After cutover a new row without a form can only be a page toggle, which does nothing.
- **Fail closed.** A `/form-definitions` failure throws, so the write fails. A `/services` failure is already caught to `[]`, which drops the content rows, so content slugs find no row and are refused while form rows still resolve.
- **No extra fetches before cutover.** The guard sits behind the build-time `pagesInEditor`, so environments without `EDITOR_V2_URL` behave exactly as before.
- **The spec mocks `../lib/service-url` with a getter.** `pagesInEditor` is a module-level const baked at load, so a plain mock value can't be switched per test.
- **api v1's `PUT /service_status` is deliberately not enforced.** It's the only thing that would stop a direct API call that skips feature_flagging, but it needs a `forwardRef` around a circular module import and puts api v1 at risk for an accident-prevention freeze. api v1 already audits every write with the verified login, #3189 retires this part of it, and its only other writer (the sandbox Journey 3 smoke) toggles a slug that has a recipe.
- **No UI change.** `index.tsx` already reverts the row and shows `err.message`. TanStack Start serializes a thrown `Error` with its message (`start-server-core`'s server-functions handler), the same path api failures already take.

## Open questions

- CI never type-checks `apps/feature_flagging`: root `tsc -b` doesn't reference it and the "Type check apps" step lists only landing, form-builder-app and editor_v2. Checked by hand with `tsc --noEmit -p apps/feature_flagging/tsconfig.json`. Not filed.
