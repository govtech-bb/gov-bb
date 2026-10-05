# Development

Start and Router are pinned together for compatibility. Their history package includes the fix that restores the current URL when blocked Forward or multi-entry navigation follows a failed draft save.

Run the app and the Nx checks from the repository root as shown in the [README](../README.md). The commands below run from `apps/editor_v2`.

## Focused checks

```sh
pnpm test
pnpm exec vitest run tests/pages
pnpm exec vitest run docs/examples
pnpm typecheck
pnpm lint
pnpm format:check
pnpm check:boundaries
pnpm check:coverage
```

The page tests use both fixed [regression fixtures](../tests/fixtures/pages/README.md) and current Markdown from `apps/landing/src/content`. Nx tracks that content as a test input. Form tests use independent inputs and expected results described in the [fixture guide](../tests/fixtures/forms/README.md).

Update the documented demo after an intentional change to `src/presets/form-registry/demo.ts`:

```sh
pnpm generate:demo
pnpm exec vitest run docs/examples
```

`generate:demo` is the only command that refreshes the documented Markdown. Ordinary tests compare the checked-in example without writing it.

Use [Code quality](CODE-QUALITY.md) for formatting commands and the validation exceptions in the lint configuration.

## App shell and routes

TanStack Start builds a static shell and renders the workspace in the browser. The root document must remain safe to render during the build; `localStorage` and document sessions belong to the client-only workspace layout. The configuration follows the official [Start setup](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch), [SPA mode](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode) and [client entry](https://tanstack.com/start/latest/docs/framework/react/guide/client-entry-point) guides.

Routes use `/services`, `/services/$serviceId` and `/services/$serviceId/$documentId`. Old `/#/services/...` links are replaced on startup. The persistent workspace keeps visited editors mounted so each document retains its undo history. Navigation flushes the current draft before changing documents; save failures and unresolved recovery block navigation.

Start generates `src/routeTree.gen.ts` during development and builds. Keep that file checked in so standalone typechecks work on a fresh checkout. It is excluded from linting and formatting; edit route files instead. Vitest uses its own configuration without the Start plugin.

## Browser checks

Start the app, then run the browser suites against the same URL:

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/playwright-core \
  pnpm exec node scripts/browser/run.mjs http://localhost:3000/
```

The runner resolves an existing `playwright` or `playwright-core` installation, with `PLAYWRIGHT_MODULE_PATH` as an alternative. Chromium must be available to that installation. Each suite uses an isolated browser context.

Pass suite names after the URL to run a subset:

```sh
pnpm exec node scripts/browser/run.mjs http://localhost:3000/ page-writer.mjs service-workspace.mjs
```

Avoid editing source while checking undo and document switching: a development reload can reset in-memory editor history. The insertion/undo regression starts on a question page because confirmation pages reject answer insertion.

## Persistence and recovery

Draft keys are supplied by the host. Workspace navigation is stored at `govbb-editor:workspace:v1`; documents use `govbb-editor:documents:<uuid>:...`. Earlier registry drafts use `govbb-editor:forms:<uuid>:...` and are discovered through `govbb-editor:active-draft`.

The original form draft uses these keys:

| Purpose | Key |
| --- | --- |
| Saved Markdown | `govbb-editor:draft:markdown:v2` |
| Previous Markdown backup | `govbb-editor:draft:markdown:v1` |
| Legacy JSON backup | `govbb-editor:draft` |
| Unapplied source | `govbb-editor:draft:markdown:working` |
| Original input before native migration | `govbb-editor:draft:native-original` |
| Interrupted JSON replacement | `govbb-editor:draft:replacement` |

Keep these keys stable when changing persistence. Unapplied source must survive reload, failed imports must retain the original input, and JSON replacement must retain the previous draft until recovery completes. Apply validates before replacing editor state. A storage failure must leave the unsaved work available for retry; conflicts between tabs require an explicit choice.

Native IDs, answer keys, option values and Markdown anchors have different roles. Copying content remaps references and identities while retaining submitted values and opaque strings. See [Converters](CONVERTERS.md) for the preservation rules.

## Known issues

- The Other switch can disagree with the option after that option is deleted. An ordinary Other choice with a conditional follow-up is available.
- Selecting Custom for a time increment does not retain a separate custom mode; the seconds editor remains visible.
- Checks for missing declaration or confirmation pages navigate to page 1 rather than the relevant insertion point.
- Require answer can target a field that is already required without a useful warning.
- Closing the source dialog with unapplied edits pauses the canvas without a clear explanation.
- Advanced → Internal alias saves in a draft, but native JSON export rejects the `name` setting. Use the visible question label in logic selectors until aliases have a native mapping.
- The loud-music demo requires both National ID and passport even though its Details text presents them as alternatives. Its definition needs conditional requirements; the documented demo and example test currently preserve that behavior.

Address lookup and opening hours provide authoring examples, not live integrations. Calculator fixtures are regression data: NIS prototype rates have not been verified for production use, and severance cases use explicit complete-years and end-year inputs.
