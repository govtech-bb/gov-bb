# Editor browser verification

The handoff's local baseline is the 15 explicit suites below. Historical results belong to the commits recorded in [EXECUTION.md](EXECUTION.md) and [TRACKER.md](TRACKER.md).

## Browser dependency

The [browser loader](../../apps/editor_v2/scripts/browser/playwright.mjs) resolves an existing `playwright` or `playwright-core` installation. If neither resolves, set `PLAYWRIGHT_MODULE_PATH` to an existing installation or local wrapper configured for the installed browser. Keep machine-specific module and browser paths in local configuration.

## Run the baseline

From `apps/editor_v2`, run the Vite dev server on an unused port (example 3110):

```sh
PORT=3110 VITE_API_ORIGIN=http://localhost:3020 pnpm run dev
```

In another pane, from the same app directory:

```sh
pnpm exec node scripts/browser/run.mjs http://localhost:3110/ \
  authentication.mjs native-logic-controls.mjs native-formula.mjs \
  native-field-controls.mjs bug-undo-after-inserts.mjs source-editing.mjs \
  unified-logic.mjs registry-insertion.mjs external-extensions.mjs \
  persistence-isolation.mjs confirmation-page.mjs remote-page-editing.mjs \
  content-modules.mjs contributions.mjs composition.mjs
```

Use `auth-fixture.mjs` and `form-fixture.mjs` for session/storage-boundary data. Remote flows should intercept the existing API contracts (services, pages, taxonomy, version) when a live API is unavailable. Keep real OAuth/cookie smoke coverage separate and label it not run if deployment credentials are unavailable. Do not run the whole default suite set and silently ignore failures.

Run relevant suites after each item and all 15 at the integrated baseline and each completed wave. Add focused regression coverage for routes/list memory, collapsed sidebar, editing/links and form preview; these are not completely covered by the original 15. Capture 1440px and 390px screenshots and focused 1199px/1200px panel checks. No source edits while suites run; one browser worker and one active heavy check queue on the shared machine.
