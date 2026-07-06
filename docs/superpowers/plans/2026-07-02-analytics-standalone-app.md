# Standalone `apps/analytics` Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move PR #1808's Umami analytics dashboard out of `apps/landing` into a standalone, separately-deployed Vite + React SPA at `apps/analytics`.

**Architecture:** Two layers. (1) A runtime SPA that renders a committed static snapshot JSON entirely client-side, depending only on shared packages (`@govtech-bb/umami-analytics`, `@govtech-bb/react`) — no landing dependency. (2) A manual refresh tool (`scripts/generate-analytics-snapshot.ts`) that fetches Umami and bakes form `title`/`category` into the snapshot via `@govtech-bb/content`, so the page needs no runtime enrichment.

**Tech Stack:** Vite 6 (catalog), `@vitejs/plugin-react`, `@tailwindcss/vite` (Tailwind v4), React (catalog), `@govtech-bb/react` design system, `tsx` for the Node generator, Vitest 4 + Testing Library for tests, nx `run-commands` targets, AWS Amplify static hosting.

## Global Constraints

- **pnpm only — never `npm`.** Use `pnpm`, `pnpm exec`, `pnpm --filter`.
- **Node 24** (`.nvmrc` = `24`).
- **nx project name must be `analytics-app`** — `packages/analytics` already owns the nx project name `analytics`. The npm package name is `@govtech-bb/analytics-app`.
- **No dotted branch names.** Work happens on branch `analytics-standalone-app` (already created as a worktree at `gov-bb-worktrees/analytics-standalone-app`, off `sandbox`).
- **All source content is vendored from `origin/landing-analytics-page`** (PR #1808's branch) — that branch is the only place these files exist; `sandbox` has none of them.
- Verify builds with `pnpm exec nx run-many -t build --exclude=landing` (landing's offline prebuild fails locally; let CI build it).
- Tests run on **Vitest 4**.

---

### Task 1: Vendor the shared `@govtech-bb/umami-analytics` package

The package is already self-contained and shared (no landing coupling). Bring it onto the branch verbatim from PR #1808 and confirm its tests pass.

**Files:**
- Create (via checkout): `packages/umami-analytics/**` (package.json, project.json, tsconfig.json, vitest.config.ts, `src/{index,types,dates,metrics,umami}.ts`, `src/{dates,metrics}.spec.ts`)

**Interfaces:**
- Produces: package `@govtech-bb/umami-analytics` exporting (`src/index.ts`) — `UmamiClient`, `aggregateFormEvents`, `buildFormDetail`, `buildFormRows(agg, meta: Map<string, FormMeta>, details, topN)`, `buildFormRows`, `buildPageRows`, `buildPresets`, `buildSearchReport`, `buildSources`, and types `FormDetail`, `FormDetailSource`, `FormMeta` (`{ title: string; category: string }`), `FormRow`, `PageRow`, `PresetReport`, `ReportModel`, `SearchReport`.

- [ ] **Step 1: Vendor the package from the PR branch**

```bash
cd /Users/shannon/Documents/develop/work/govtech-barbados/gov-bb-worktrees/analytics-standalone-app
git checkout origin/landing-analytics-page -- packages/umami-analytics
```

- [ ] **Step 2: Install so the workspace picks up the new package**

Run: `pnpm install`
Expected: completes; `@govtech-bb/umami-analytics` linked into the workspace.

- [ ] **Step 3: Run the package's existing unit tests**

Run: `pnpm exec nx run umami-analytics:test`
Expected: PASS — 25 tests across `dates.spec.ts` + `metrics.spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/umami-analytics pnpm-lock.yaml
git commit -m "feat(umami-analytics): vendor shared aggregation package

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Scaffold `apps/analytics` as a Vite React SPA shell

Stand up the app skeleton — config, entry point, global CSS, an nx build target — rendering a placeholder. This task's deliverable is "the app builds and a smoke test renders it."

**Files:**
- Create: `apps/analytics/package.json`
- Create: `apps/analytics/index.html`
- Create: `apps/analytics/vite.config.ts`
- Create: `apps/analytics/tsconfig.json`
- Create: `apps/analytics/project.json`
- Create: `apps/analytics/vitest.config.ts`
- Create: `apps/analytics/src/main.tsx`
- Create: `apps/analytics/src/styles.css`
- Create: `apps/analytics/src/App.tsx` (temporary placeholder, replaced in Task 3)
- Test: `apps/analytics/src/App.test.tsx`

**Interfaces:**
- Consumes: `@govtech-bb/umami-analytics` (Task 1), `@govtech-bb/react` (published design system).
- Produces: nx project `analytics-app` with a `build` target emitting `apps/analytics/dist`, a `test` target, and a `serve` target.

- [ ] **Step 1: Create `apps/analytics/package.json`**

```json
{
  "name": "@govtech-bb/analytics-app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev --port 3100",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "generate:analytics": "tsx scripts/generate-analytics-snapshot.ts"
  },
  "dependencies": {
    "@fontsource/figtree": "^5.2.10",
    "@govtech-bb/design": "^1.0.0-alpha.17",
    "@govtech-bb/react": "^1.0.0-alpha.17",
    "@govtech-bb/umami-analytics": "workspace:*",
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "@govtech-bb/content": "workspace:*",
    "@tailwindcss/vite": "^4.3.0",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^24.0.0",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "^6.0.2",
    "eslint": "^10.2.0",
    "jsdom": "^28.1.0",
    "tailwindcss": "^4.3.0",
    "tsx": "^4.22.3",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: Create `apps/analytics/index.html`**

`robots: noindex` lives here (there is no SSR `head` in a static SPA).

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>Analytics | Government of Barbados</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `apps/analytics/vite.config.ts`**

The app imports `@govtech-bb/umami-analytics` (resolved through the pnpm workspace symlink to its `./src/index.ts` export) — Vite transforms that source directly, so no tsconfig-paths plugin is needed.

```ts
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), viteReact()],
})
```

- [ ] **Step 4: Create `apps/analytics/tsconfig.json`**

Mirrors landing's bundler-mode config, minus the landing-only `#/*` and content paths. **No `references`** — `@govtech-bb/umami-analytics` isn't a `composite` project (its tsconfig is `noEmit`), so it resolves through the pnpm workspace `exports` → `src/index.ts`, exactly as landing consumes it. Adding a project reference to a non-composite project would break `tsc`.

```json
{
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["scripts", "dist"],
  "compilerOptions": {
    "target": "ES2022",
    "jsx": "react-jsx",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  }
}
```

- [ ] **Step 5: Create `apps/analytics/project.json`**

nx project name is `analytics-app`. Targets shell out with `pnpm run` (never `npm`), matching the run-commands pattern the other apps use.

```json
{
  "name": "analytics-app",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/analytics/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "outputs": ["{projectRoot}/dist"],
      "options": { "command": "pnpm run build", "cwd": "apps/analytics" }
    },
    "dev": {
      "executor": "nx:run-commands",
      "options": { "command": "pnpm run dev", "cwd": "apps/analytics" }
    },
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "pnpm run lint", "cwd": "apps/analytics" }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "pnpm run test", "cwd": "apps/analytics" }
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": { "command": "pnpm run typecheck", "cwd": "apps/analytics" }
    }
  },
  "tags": []
}
```

- [ ] **Step 6: Create `apps/analytics/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [viteReact()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

- [ ] **Step 7: Create `apps/analytics/src/styles.css`** (copied verbatim from landing — the `@source` relative path still points at repo-root `node_modules` from this depth)

```css
@import "@fontsource/figtree/400.css";
@import "@fontsource/figtree/500.css";
@import "@fontsource/figtree/600.css";
@import "@fontsource/figtree/700.css";
@import "@fontsource/figtree/800.css";
@import "tailwindcss";
/* Import the design tokens */
@import "@govtech-bb/design";

/* Scan the design system's compiled output for Tailwind class names */
@source "../../../node_modules/@govtech-bb/react/dist/**/*.{js,cjs}";
@plugin "@tailwindcss/typography";

@theme {
  --font-sans: "Figtree", ui-sans-serif, system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: var(--color-white-00);
  color: var(--color-black-00);
  font-family: var(--font-family-base);
}

.container {
  margin-inline: auto;
  width: 100%;
  padding-inline: var(--spacing-s); /* 16px */

  @media (width >= 640px) {
    padding-inline: var(--spacing-m); /* 32px */
  }

  @media (width >= 1280px) {
    padding-inline: var(--spacing-l); /* 64px */
  }

  @media (width >= 1512px) {
    padding-inline: var(--spacing-xl); /* 128px */
  }
}
```

- [ ] **Step 8: Create `apps/analytics/src/App.tsx`** (temporary placeholder — replaced by the real page in Task 3)

```tsx
import { Heading } from '@govtech-bb/react'

export default function App() {
  return (
    <div className="container py-8">
      <Heading as="h1" size="h1">
        Analytics
      </Heading>
    </div>
  )
}
```

- [ ] **Step 9: Create `apps/analytics/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 10: Write the failing smoke test — `apps/analytics/src/App.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders the Analytics heading', () => {
  render(<App />)
  expect(
    screen.getByRole('heading', { name: 'Analytics' }),
  ).toBeDefined()
})
```

- [ ] **Step 11: Install and run the test to verify it passes**

Run: `pnpm install && pnpm exec nx run analytics-app:test`
Expected: PASS (1 test). If `pnpm install` reports the new package, that's expected.

- [ ] **Step 12: Verify the app builds**

Run: `pnpm exec nx run analytics-app:build`
Expected: Vite build succeeds; `apps/analytics/dist/index.html` + assets emitted.

- [ ] **Step 13: Commit**

```bash
git add apps/analytics pnpm-lock.yaml
git commit -m "feat(analytics): scaffold standalone Vite SPA shell

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Port the dashboard page + snapshot, strip the landing coupling

Bring over the route component, the committed snapshot, and the snapshot re-export lib. Transform the TanStack route into a plain default-exported component and delete the `PAGES`/`enrich()` block (form rows arrive pre-enriched from the snapshot after Task 4; until then they fall back to `formId`/`uncategorised`, which is fine and testable).

**Files:**
- Create: `apps/analytics/src/AnalyticsPage.tsx` (from `apps/landing/src/routes/analytics.tsx` on the PR branch, transformed)
- Create: `apps/analytics/src/lib/report.ts` (from `apps/landing/src/lib/umami-analytics.ts` on the PR branch)
- Create: `apps/analytics/src/content/analytics-snapshot.json` (from the PR branch)
- Modify: `apps/analytics/src/main.tsx` (render `AnalyticsPage` instead of `App`)
- Delete: `apps/analytics/src/App.tsx`, `apps/analytics/src/App.test.tsx`
- Test: `apps/analytics/src/AnalyticsPage.test.tsx`

**Interfaces:**
- Consumes: `REPORT` (typed `ReportModel`) and re-exported types from `./lib/report`.
- Produces: `AnalyticsPage` default export — a self-contained dashboard component.

- [ ] **Step 1: Vendor the three files into their new locations**

```bash
cd /Users/shannon/Documents/develop/work/govtech-barbados/gov-bb-worktrees/analytics-standalone-app
mkdir -p apps/analytics/src/lib apps/analytics/src/content
git show origin/landing-analytics-page:apps/landing/src/routes/analytics.tsx > apps/analytics/src/AnalyticsPage.tsx
git show origin/landing-analytics-page:apps/landing/src/lib/umami-analytics.ts > apps/analytics/src/lib/report.ts
git show origin/landing-analytics-page:apps/landing/src/content/analytics-snapshot.json > apps/analytics/src/content/analytics-snapshot.json
```

- [ ] **Step 2: Edit `apps/analytics/src/lib/report.ts`** — no code change needed to the body (the `../content/analytics-snapshot.json` relative path is identical at the new depth), but confirm its imports resolve. The file should read exactly:

```ts
// Static analytics data for the /analytics page. The numbers live in a JSON
// COMMITTED to the repo (analytics-snapshot.json) and bundled at build time —
// the page never calls Umami at request time, and deploys need no UMAMI_* env.
// Refresh by running `pnpm run generate:analytics` and committing the result.
import type {
  FormDetail,
  FormRow,
  PageRow,
  PresetReport,
  ReportModel,
  SearchReport,
} from '@govtech-bb/umami-analytics'
import snapshot from '../content/analytics-snapshot.json'

// The committed snapshot.json is a placeholder (empty presets) the build
// overwrites; cast through unknown since its literal type is narrower.
export const REPORT = snapshot as unknown as ReportModel

export type { FormDetail, FormRow, PageRow, PresetReport, SearchReport }
```

- [ ] **Step 3: Transform `apps/analytics/src/AnalyticsPage.tsx`** — apply exactly these six edits:

  1. Delete the first import line:
     ```ts
     import { createFileRoute } from '@tanstack/react-router'
     ```
  2. Delete the landing content-registry import:
     ```ts
     import { PAGES } from '../content/registry'
     ```
  3. Repoint the report imports from the landing lib path to the local one — change both:
     ```ts
     import { REPORT } from '../lib/umami-analytics'
     import type { FormDetail, FormRow, SearchReport } from '../lib/umami-analytics'
     ```
     to:
     ```ts
     import { REPORT } from './lib/report'
     import type { FormDetail, FormRow, SearchReport } from './lib/report'
     ```
  4. Delete the entire `Route` export block:
     ```ts
     export const Route = createFileRoute('/analytics')({
       head: () => ({
         meta: [
           { name: 'robots', content: 'noindex' },
         ],
       }),
       component: AnalyticsPage,
     })
     ```
     (Copy the exact block from the file — it spans the `createFileRoute('/analytics')({ … })` call. `robots: noindex` is already handled in `index.html` from Task 2.)
  5. Delete the `FORM_META` map, its `for (const page of PAGES)` loop, and the `enrich` function — the whole block that begins:
     ```ts
     // form_id -> { title, category } from landing's own content registry, used to
     // label the form rows (the build-time snapshot only knows form ids).
     const FORM_META = new Map<string, { title: string; category: string }>()
     for (const page of PAGES) { … }

     function enrich(forms: FormRow[]): FormRow[] { … }
     ```
     Also delete the now-unused `FormRow` type import if nothing else references it — but `FormRow` IS still referenced by the drawer/table code, so keep it in the type import from step 3.
  6. Make the component the default export and stop enriching. Change:
     ```ts
     function AnalyticsPage() {
     ```
     to:
     ```ts
     export default function AnalyticsPage() {
     ```
     and change:
     ```ts
     const forms = enrich(current.forms)
     ```
     to:
     ```ts
     const forms = current.forms
     ```

- [ ] **Step 4: Point the SPA entry at the real page — edit `apps/analytics/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import AnalyticsPage from './AnalyticsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnalyticsPage />
  </StrictMode>,
)
```

- [ ] **Step 5: Remove the placeholder + its test**

```bash
git rm apps/analytics/src/App.tsx apps/analytics/src/App.test.tsx
```

- [ ] **Step 6: Write the page smoke test — `apps/analytics/src/AnalyticsPage.test.tsx`**

The committed snapshot has real presets, so the page renders the dashboard (not the "empty snapshot" fallback). Assert the top-level heading and the preset `<select>` render.

```tsx
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import AnalyticsPage from './AnalyticsPage'

test('renders the dashboard from the committed snapshot', () => {
  render(<AnalyticsPage />)
  // Top pages table heading is always present when a preset exists.
  expect(screen.getByRole('combobox')).toBeDefined()
  expect(screen.getAllByRole('heading').length).toBeGreaterThan(0)
})
```

- [ ] **Step 7: Run the test to verify it fails first (page not yet wired), then passes after the edits**

Run: `pnpm exec nx run analytics-app:test`
Expected: PASS (1 test). If it fails with a missing `combobox`, confirm the snapshot has non-empty `presets` (it should — it was committed with 5 presets).

- [ ] **Step 8: Verify typecheck + build**

Run: `pnpm exec nx run analytics-app:typecheck && pnpm exec nx run analytics-app:build`
Expected: `tsc --noEmit` clean (no unused `createFileRoute`/`PAGES`/`enrich`), Vite build emits `dist`.

- [ ] **Step 9: Commit**

```bash
git add apps/analytics
git commit -m "feat(analytics): port dashboard page + snapshot, drop landing coupling

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Port the snapshot generator with baked form metadata

Bring over the generator and make it self-sufficient: instead of leaving form `title`/`category` empty for the page to enrich, resolve them from `@govtech-bb/content` and bake them into the snapshot. This is the piece that lets Task 3's page drop `enrich()`.

**Files:**
- Create: `apps/analytics/scripts/generate-analytics-snapshot.ts` (from the PR branch, modified)

**Interfaces:**
- Consumes: `@govtech-bb/umami-analytics` (client + builders + `FormMeta`), `@govtech-bb/content` (`loadContent`). Reads `UMAMI_*` env + `LANDING_CONTENT_DIR` (defaults to `apps/landing/src/content`).
- Produces: writes `apps/analytics/src/content/analytics-snapshot.json` with form rows carrying real `title`/`category`.

- [ ] **Step 1: Vendor the generator**

```bash
cd /Users/shannon/Documents/develop/work/govtech-barbados/gov-bb-worktrees/analytics-standalone-app
mkdir -p apps/analytics/scripts
git show origin/landing-analytics-page:apps/landing/scripts/generate-analytics-snapshot.ts > apps/analytics/scripts/generate-analytics-snapshot.ts
```

The `OUT` path (`../src/content/analytics-snapshot.json`) and the `.env` path (`../../../.env`) are both correct unchanged — `apps/analytics/scripts` is the same depth as `apps/landing/scripts`.

- [ ] **Step 2: Add the content import** — at the top of `apps/analytics/scripts/generate-analytics-snapshot.ts`, add alongside the existing `@govtech-bb/umami-analytics` import:

```ts
import { loadContent } from '@govtech-bb/content'
import type { FormMeta } from '@govtech-bb/umami-analytics'
```

- [ ] **Step 3: Build the form-meta map once and pass it to `buildFormRows`**

In `main()`, after `const client = new UmamiClient(...)` and before the preset loop, build the meta map from landing content:

```ts
  // Resolve form_id -> { title, category } from the shared content package so
  // the snapshot is self-describing (the page does no enrichment). Reads the
  // landing content dir (LANDING_CONTENT_DIR, else apps/landing/src/content).
  const { services } = await loadContent({})
  const meta = new Map<string, FormMeta>()
  for (const s of services) {
    if (!s.form_id || meta.has(s.form_id)) continue
    meta.set(s.form_id, {
      title: s.title,
      category: s.categories?.[0] ?? 'uncategorised',
    })
  }
```

Then change the `buildPreset` call so the meta map reaches `buildFormRows`. Update `buildPreset`'s signature to accept `meta`:

```ts
async function buildPreset(
  client: UmamiClient,
  cfg: NonNullable<ReturnType<typeof readEnv>>,
  meta: Map<string, FormMeta>,
  preset: {
    key: string
    label: string
    range: { startAt: number; endAt: number }
  },
): Promise<PresetReport> {
```

Inside `buildPreset`, replace:

```ts
  // Empty meta: the page enriches title/category from its content registry
  // (which is vite-compiled and can't be imported here).
  const forms = buildFormRows(agg, new Map(), details, TOP_N)
```

with:

```ts
  const forms = buildFormRows(agg, meta, details, TOP_N)
```

And update the call site in `main()`'s loop:

```ts
      reports.push(await buildPreset(client, cfg, meta, preset))
```

- [ ] **Step 4: Verify it runs without creds without blanking the snapshot**

Run (no UMAMI creds in env): `pnpm --filter @govtech-bb/analytics-app run generate:analytics`
Expected: prints `UMAMI_* not configured — leaving the committed placeholder snapshot in place.` and exits 0. `git status` shows `analytics-snapshot.json` **unchanged**.

- [ ] **Step 5: (Optional, requires creds) Regenerate the real snapshot**

If `UMAMI_API_KEY` / `UMAMI_LANDING_WEBSITE_ID` / `UMAMI_FORMS_WEBSITE_ID` are available in the root `.env`:
Run: `pnpm --filter @govtech-bb/analytics-app run generate:analytics`
Expected: builds 5 presets; `analytics-snapshot.json` updated with form rows now carrying real `title`/`category`. Inspect one form row to confirm `title` is a human string, not the form id. If creds are unavailable, skip — the committed snapshot from Task 3 still renders (titles fall back to form ids until a maintainer regenerates).

- [ ] **Step 6: Typecheck the generator**

The app `tsconfig.json` excludes `scripts`, so typecheck it directly against Node types via tsx's transpile-run in Step 4 (a successful run is the check). Confirm no runtime `import`/type errors surfaced.

- [ ] **Step 7: Commit**

```bash
git add apps/analytics/scripts apps/analytics/src/content/analytics-snapshot.json
git commit -m "feat(analytics): generator bakes form title/category via @govtech-bb/content

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire Amplify build config, verify the workspace, open the PR

Add `apps/analytics` to the root `amplify.yml` as a static app (mirroring `apps/forms`), run the full workspace build/tests, push, open the PR, and close #1808.

**Files:**
- Modify: `amplify.yml` (add an `apps/analytics` application block)

**Interfaces:** none (deployment + housekeeping).

- [ ] **Step 1: Add the `apps/analytics` application block to `amplify.yml`**

Append this application entry (mirrors the `apps/forms` static pattern — `baseDirectory: apps/analytics/dist`, build via nx). Insert it as a new item in the top-level `applications:` list:

```yaml
  - appRoot: apps/analytics
    frontend:
      buildPath: /
      phases:
        preBuild:
          commands:
            - nvm use $(cat .nvmrc) || nvm install $(cat .nvmrc)
            - npm install -g pnpm@11.6.0
            - pnpm install --frozen-lockfile
        build:
          commands:
            - pnpm exec nx run analytics-app:build
      artifacts:
        baseDirectory: apps/analytics/dist
        files:
          - "**/*"
      cache:
        paths:
          - node_modules/**/*
          - .nx/cache/**/*
      customHeaders:
        - pattern: "**/*"
          headers:
            - key: "Strict-Transport-Security"
              value: "max-age=63072000; includeSubDomains; preload"
            - key: "X-Content-Type-Options"
              value: "nosniff"
            - key: "Referrer-Policy"
              value: "strict-origin-when-cross-origin"
            - key: "X-Frame-Options"
              value: "DENY"
            - key: "Permissions-Policy"
              value: "camera=(), microphone=(), geolocation=(), payment=()"
            - key: "Content-Security-Policy"
              value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
```

(The `preBuild` uses `npm install -g pnpm` / `npm run`-free build — these are Amplify's bootstrap lines copied verbatim from the sibling apps; the actual build runs through pnpm/nx.)

- [ ] **Step 2: Verify the full workspace builds (excluding landing's offline-fragile prebuild)**

Run: `pnpm exec nx run-many -t build --exclude=landing`
Expected: all projects build, including `analytics-app`.

- [ ] **Step 3: Run the touched projects' tests**

Run: `pnpm exec nx run umami-analytics:test && pnpm exec nx run analytics-app:test`
Expected: PASS (25 + 1).

- [ ] **Step 4: Commit the deploy config**

```bash
git add amplify.yml
git commit -m "ci(analytics): add apps/analytics static app to amplify.yml

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Push and open the PR against `sandbox`**

```bash
git push -u origin analytics-standalone-app
gh pr create --base sandbox --title "feat(analytics): standalone apps/analytics dashboard (moved from landing)" \
  --label "enhancement,area:frontend,subsystem:landing,subsystem:ci" \
  --body "$(cat <<'EOF'
## What

Moves the Umami analytics dashboard out of `apps/landing` (superseding #1808) into its own standalone Vite + React SPA at `apps/analytics`, deployed as its own Amplify static app.

## How

- **Runtime SPA** (`apps/analytics`) renders the committed `analytics-snapshot.json` entirely client-side. Depends only on `@govtech-bb/umami-analytics` (types) and `@govtech-bb/react` (design system) — no `apps/landing` dependency. `robots: noindex`, public.
- **Shared package** `@govtech-bb/umami-analytics` vendored unchanged (25 unit tests).
- **Generator** (`scripts/generate-analytics-snapshot.ts`, manual refresh via `pnpm --filter @govtech-bb/analytics-app run generate:analytics`) now bakes form `title`/`category` into the snapshot via `@govtech-bb/content`, so the page needs no runtime enrichment.
- **Amplify**: added an `apps/analytics` static application block to root `amplify.yml`.

## Follow-up (not in this PR)

- Provision the Amplify app + domain for `apps/analytics` (console/infra) and wire its App ID into `deploy-sandbox.yml` / `deploy-prod.yml` / `pr-preview.yml`.

Closes #1808 (this replaces the landing-integrated approach).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Close PR #1808, pointing at the replacement**

```bash
NEW_PR=$(gh pr view analytics-standalone-app --json url -q .url)
gh pr close 1808 --comment "Superseded by ${NEW_PR}, which moves this work into a standalone \`apps/analytics\` app instead of integrating it into landing."
```

---

## Notes for the implementer

- If `pnpm install` in Task 2 warns that catalog versions (`catalog:`) don't resolve for a dep, check the version exists in `pnpm-workspace.yaml`'s catalog — copy the exact spec landing uses rather than inventing one.
- The `@source` line in `styles.css` is depth-sensitive: it must remain `../../../node_modules/...` (three levels up from `apps/analytics/src/` = repo root). Do not "simplify" it.
- Deployment (creating the Amplify app, DNS, wiring App IDs into the deploy workflows) is intentionally out of scope — it needs the new Amplify App ID, which only exists after console provisioning. `amplify.yml` is the only repo-side deploy change here.
