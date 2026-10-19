# Editor backlog implementation brief

Shared product and engineering rules for `apps/editor_v2`, the GovBB CMS editor for service pages and forms. Use [TRACKER.md](TRACKER.md) for item status and [BROWSER.md](BROWSER.md) for browser verification.

## Working conventions

- Follow the repository's `CLAUDE.md` and the session's agreed scope.
- Use pnpm and the existing dependencies.
- Keep temporary probes, screenshots and logs outside product source.

## The app

React 19, TanStack Start/Router (SPA mode), Lexical 0.51, Base UI 1.8 (`@base-ui/react`), Tailwind v4, Phosphor icons, `cn`, oxlint with vendored anti-slop rules, oxfmt, Vitest 4.

Read before you start: `apps/editor_v2/README.md`, `PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/CODE-QUALITY.md`, `docs/TERMINOLOGY.md`, the shared kit in `src/ui/` (and `src/ui/surface.ts`'s shared class strings), and the component gallery `src/routes/prototypes.components.tsx` (served at `/prototypes/components`).

## The user's rules (non-negotiable)

1. **Componentize.** Every UI pattern is ONE shared component in `src/ui` (or one shared helper), used everywhere. Never hand-make a second copy of something that exists, and never leave look-alikes behind: when you add a shared component, move every existing copy onto it in the same change, add it to the gallery with a short demo, and give it a test beside it (`src/ui/<name>.test.tsx`). Before building anything, search `src/ui` and the shared class strings and extend what's there.
2. **Build with existing dependencies.** Use the installed editor and UI stack to implement each board item's behaviour, API shape, wording patterns and density; style with GovBB tokens (`index.css`, `src/ui/cn.ts`).
3. **Keep GovBB's look.** Type: 12/16 meta, 14/20 UI, 16/24 lead, 20/28 dialog and panel titles, 28/36 page titles; semibold is the one emphasis. Controls: Button xs 24, sm 32 (default), md 36, lg 40; icon-only buttons are square; icons 16px. Bars are 56px with `px-4 sm:px-6`. Menus: 32px rows, `p-1`/`py-1` frames, rows `mx-1`, other list content at `px-3.5`. Keep menus at this density. 44px touch targets under `pointer: coarse`.
4. **The settings side panel sits beside the page from 1200px (xl) and is a drawer below.** The user chose this; don't change the breakpoint.
5. **Copy:** plain British English for ministry staff, sentence case, short. No internals ("content API", "regex", "node", "schema", "JSON path") in author-facing text. Use the nouns and verbs in `docs/TERMINOLOGY.md`. Buttons name the outcome ("Delete page", "Publish changes"), not "OK".
6. **Accessibility is part of done:** every control has a name, role and state; focus is visible; everything is keyboard reachable; motion respects `prefers-reduced-motion`; live regions announce real changes only.

## Engineering rules

- Surgical changes: every changed line traces to one of your items. Match the surrounding style, naming and comment density. No speculative abstractions or options nobody asked for. Remove what your change makes unused; don't delete unrelated dead code (mention it instead).
- Import boundaries are enforced by `scripts/check-boundaries.ts`: `src/ui` imports only ui, `cn`, react, `@base-ui`, phosphor and date libraries; browser globals only in `src/editor/react`, the form browser layer, page and workspace `.tsx` files and `src/host`; `src/pages` may import editor and ui. Read the script if unsure.
- The lint rules are strict. Fix the code instead of disabling a rule. Frequent ones: `no-known-value-widening` (use a Map or a precise type instead of `Record<string, string>`), `require-readable-spacing`, `no-runtime-typeof` in tests.
- Never hand-edit `src/routeTree.gen.ts`. If you add or rename a route, run the build (or dev server) so the router plugin regenerates it, and commit the regenerated file with the route.
- Persisted formats (saved drafts, Markdown, form JSON) must stay readable: old saved data has to load.
- Tests: every behaviour change gets a test that fails without the change. Prove it once: undo the fix, watch the test fail, restore. Unit tests go in `apps/editor_v2/tests/...` (mirroring `src/`) or beside a `src/ui` component. Look at existing tests for helpers (e.g. `tests/helpers/page-editor.tsx`, headless Lexical setups in `tests/editor`, `tests/forms`).

## Checks before every commit

Run from `apps/editor_v2`:

```sh
pnpm exec tsc --noEmit && pnpm run lint && pnpm run format:check && pnpm run check:boundaries && pnpm exec vitest run --maxWorkers=4 && VITE_API_ORIGIN=https://api.example.invalid pnpm run build
```

While iterating, run single files (`pnpm exec vitest run tests/x/y.test.ts`). `pnpm run format` fixes formatting. Complete the checks before committing and stop temporary servers when finished.

## Commits

One commit per board item (a large item may take a few commits, each one green). Message:

```
<fix|feat|refactor>(editor_v2): <one line, plain English, what changes for the author>

<Short paragraphs: what was wrong for the author, what happens now, and which
shared component was added or extended and where it's now used.>
```

Stage explicit paths (`git add <paths>`), check `git status` and `git diff --cached --stat` before committing. If a hook changes formatting, rerun `pnpm run format:check`.

## Reporting

Record completed item ids, user-visible changes, shared components, validation results and remaining work. List any server changes still needed for an editor feature.
