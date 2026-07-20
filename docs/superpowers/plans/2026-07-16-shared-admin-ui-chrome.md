# Shared admin-ui chrome + feature_flagging restyle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/feature_flagging` the Government of Barbados design-system look used by `apps/analytics`, and extract the compact site-header shell into a new shared `@govtech-bb/admin-ui` workspace package.

**Architecture:** A new source-only workspace package `@govtech-bb/admin-ui` holds a presentational `SiteHeader` (the blue branded bar). `apps/feature_flagging` gains Tailwind v4 + `@govtech-bb/design` tokens + `@govtech-bb/react` + Figtree (mirroring analytics' setup), its `app.css` hand-written rules are retired, and every surface (login, header, services table, filters, status, confirm modal, audit drawer) is restyled with design tokens/utilities. `apps/analytics` is left untouched.

**Tech Stack:** TanStack Start (Vite), React 19, Tailwind CSS v4 (`@tailwindcss/vite`), `@govtech-bb/design` (tokens), `@govtech-bb/react` (`Logo`, `Button`), Figtree (`@fontsource/figtree`), Vitest 4.

## Global Constraints

- Use **pnpm** for everything, never npm.
- New workspace package scope: **`@govtech-bb/admin-ui`** (matches repo convention).
- Pin `@govtech-bb/design` and `@govtech-bb/react` to **`^1.0.0-alpha.17`** (identical to `apps/analytics`).
- Branch off `main`, no `.` in the branch name; open the PR **against `main`**.
- Restyle only — **all existing behaviour is preserved** (GitHub OAuth flow, optimistic status change + rollback, FLIP row animation, 500ms-debounced search, URL-synced filters, ESC-to-close drawer). No routing/server changes.
- Match analytics' *actual* approach: design **tokens + utility classes** everywhere, using DS components only where analytics does (`Logo`; plus `Button` for CTAs). Do **not** use DS `Search` (submit-only, breaks the live filter), DS `Select`/`Input` (heavy 2px-border/20px style, not the compact analytics look), or `StatusBanner` (its variants are phase labels: alpha/beta/migrated/service-issue). Style raw controls with tokens instead.
- Design tokens available (hex for reference): `blue-00 #00164a`, `blue-100 #00267f`, `blue-40 #99a8cc`, `blue-10 #e5e9f2`, `white-00 #fff`, `black-00 #000`, `grey-00 #e0e4e9` (borders), `mid-grey-00 #595959` (muted text), `teal-100 #30c0c8` (focus ring), `green-00 #00654a`/`green-10 #e9f9f3`, `red-00 #a42c2c`/`red-10 #fff0f0`, `yellow-00 #e8a833`/`yellow-40 #ffe9a8`/`yellow-10 #fff9e9`. Spacing: `xxs 4 / xs 8 / s 16 / xm 24 / m 32 / l 64`. Font sizes: `caption 16px`, `caption-sm 12px`, `h3 24px`, `h4 20px`.
- Since restyle changes carry no unit tests, restyle tasks are gated by **typecheck/build passing + the existing spec suite staying green + a visual check in the running app**, not by new tests. Only Task 1 (`SiteHeader`) is TDD.

---

### Task 1: Create the `@govtech-bb/admin-ui` package with `SiteHeader`

**Files:**
- Create: `packages/admin-ui/package.json`
- Create: `packages/admin-ui/project.json`
- Create: `packages/admin-ui/tsconfig.json`
- Create: `packages/admin-ui/vitest.config.ts`
- Create: `packages/admin-ui/src/index.ts`
- Create: `packages/admin-ui/src/SiteHeader.tsx`
- Test: `packages/admin-ui/src/SiteHeader.spec.tsx`
- Modify: `tsconfig.base.json` (add a `paths` entry)

**Interfaces:**
- Produces: `SiteHeader({ label: string, homeHref?: string, children?: React.ReactNode }): JSX.Element` — exported from `@govtech-bb/admin-ui`. Renders a blue site bar: DS `Logo` + divider + `label` on the left; `children` in a right-aligned slot. `homeHref` (default `"/"`) wraps the logo+label in a plain `<a>`.

- [ ] **Step 1: Create the package manifest**

Create `packages/admin-ui/package.json`:

```json
{
  "name": "@govtech-bb/admin-ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "peerDependencies": {
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "dependencies": {
    "@govtech-bb/react": "^1.0.0-alpha.17"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.2",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "^6.0.2",
    "jsdom": "^28.1.0",
    "react": "catalog:",
    "react-dom": "catalog:",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: Create the nx project (test + lint only, no build target)**

`@govtech-bb/admin-ui` is consumed as source by the Vite apps (resolved via the `tsconfig.base.json` path), so it needs no `@nx/js:tsc` build target. Create `packages/admin-ui/project.json`:

```json
{
  "name": "admin-ui",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/admin-ui/src",
  "projectType": "library",
  "targets": {
    "test": {
      "executor": "nx:run-commands",
      "options": {
        "command": "vitest run",
        "cwd": "packages/admin-ui"
      }
    }
  },
  "tags": []
}
```

- [ ] **Step 3: Create tsconfig and vitest config**

Create `packages/admin-ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "noEmit": true,
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

Create `packages/admin-ui/vitest.config.ts` (mirrors `apps/analytics/vitest.config.ts`):

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

- [ ] **Step 4: Add the workspace path so imports resolve**

In `tsconfig.base.json`, add to `compilerOptions.paths` (keep alphabetical-ish with the other `@govtech-bb/*` entries):

```json
"@govtech-bb/admin-ui": ["packages/admin-ui/src/index.ts"],
```

- [ ] **Step 5: Install so pnpm links the new workspace package**

Run: `pnpm install`
Expected: completes; `@govtech-bb/admin-ui` symlinked into the workspace. (This also installs the package's devDeps.)

- [ ] **Step 6: Write the failing test**

Create `packages/admin-ui/src/SiteHeader.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { SiteHeader } from './SiteHeader'

describe('SiteHeader', () => {
  it('renders the label and the Government of Barbados logo', () => {
    render(<SiteHeader label="Service visibility" />)
    expect(screen.getByText('Service visibility')).toBeInTheDocument()
    // DS Logo renders an <svg role="img"> with the wordmark viewBox.
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 276 27')
  })

  it('links the wordmark to homeHref (default "/")', () => {
    const { rerender } = render(<SiteHeader label="X" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/')
    rerender(<SiteHeader label="X" homeHref="/dashboard" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/dashboard')
  })

  it('renders children in the right slot', () => {
    render(
      <SiteHeader label="X">
        <button type="button">Sign out</button>
      </SiteHeader>,
    )
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})
```

Note: `toBeInTheDocument`/`toHaveAttribute` come from `@testing-library/jest-dom` matchers, which are auto-extended by `@testing-library/react` v16 in Vitest when `globals: true`. If a matcher is missing at run time, add `import '@testing-library/jest-dom/vitest'` at the top of the spec (no extra dep — it ships with `@testing-library/react`'s peer, already present in the app; if unavailable in this package, drop the `.toBeInTheDocument()` calls in favour of `expect(screen.getByText(...)).toBeTruthy()`).

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm --filter @govtech-bb/admin-ui test`
Expected: FAIL — `Cannot find module './SiteHeader'` (file not created yet).

- [ ] **Step 8: Implement `SiteHeader`**

Create `packages/admin-ui/src/SiteHeader.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Logo } from '@govtech-bb/react'

/**
 * Compact blue site bar shared by the platform's internal admin tools: the
 * Government of Barbados wordmark + a short app label on the left, and a
 * right-aligned slot (`children`) for page-specific controls. Presentational
 * and router-agnostic — the wordmark links home via a plain anchor so the
 * component couples to no particular router.
 *
 * The design tokens/utility classes it uses (`bg-blue-00`, `container`,
 * `text-caption`, spacing) must be provided by the consuming app's Tailwind +
 * `@govtech-bb/design` setup, and the app's CSS must `@source` this package so
 * these classes are generated.
 */
export function SiteHeader({
  label,
  homeHref = '/',
  children,
}: {
  label: string
  homeHref?: string
  children?: ReactNode
}) {
  return (
    <div className="bg-blue-00 text-white-00">
      <div className="container flex h-16 items-center gap-m">
        <a
          href={homeHref}
          className="flex items-center gap-s focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-100"
        >
          <Logo className="h-7 w-auto text-white-00" />
          <span aria-hidden="true" className="h-4 w-px bg-blue-40/60" />
          <span className="font-normal text-blue-40 text-caption">{label}</span>
        </a>
        {children ? (
          <div className="ml-auto flex items-center gap-s text-caption">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  )
}
```

Create `packages/admin-ui/src/index.ts`:

```ts
export { SiteHeader } from './SiteHeader'
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter @govtech-bb/admin-ui test`
Expected: PASS — all three `SiteHeader` cases green.

- [ ] **Step 10: Commit**

```bash
git add packages/admin-ui tsconfig.base.json pnpm-lock.yaml
git commit -m "feat(admin-ui): add shared SiteHeader package"
```

---

### Task 2: Wire feature_flagging onto the design system + restyle the login page

This task stands up the whole Tailwind/tokens pipeline and proves it end-to-end on the smallest surface (login). The wiring has no standalone test, so the login restyle is its deliverable.

**Files:**
- Modify: `apps/feature_flagging/package.json` (deps)
- Modify: `apps/feature_flagging/vite.config.ts` (add `tailwindcss()` plugin)
- Modify: `apps/feature_flagging/app/styles/app.css` (replace preamble; keep app rules for now)
- Modify: `apps/feature_flagging/app/routes/login.tsx` (restyle)

**Interfaces:**
- Consumes: `SiteHeader` from `@govtech-bb/admin-ui` (Task 1); `Button` from `@govtech-bb/react`.

- [ ] **Step 1: Add dependencies**

Edit `apps/feature_flagging/package.json`. Add to `dependencies`:

```json
"@fontsource/figtree": "^5.2.10",
"@govtech-bb/admin-ui": "workspace:*",
"@govtech-bb/design": "^1.0.0-alpha.17",
"@govtech-bb/react": "^1.0.0-alpha.17",
```

Add to `devDependencies`:

```json
"@tailwindcss/vite": "^4.3.0",
"tailwindcss": "^4.3.0",
```

Then run: `pnpm install`
Expected: completes, lockfile updated.

- [ ] **Step 2: Add the Tailwind Vite plugin**

Edit `apps/feature_flagging/vite.config.ts`. Add the import at the top:

```ts
import tailwindcss from "@tailwindcss/vite";
```

In the returned config's `plugins` array, add `tailwindcss()` as the **first** entry (before `nitro`):

```ts
    plugins: [
      tailwindcss(),
      nitro({
```

- [ ] **Step 3: Replace the CSS preamble (keep existing app rules below for now)**

Edit `apps/feature_flagging/app/styles/app.css`. Replace the current `:root { … }` / `* {} ` / `body {}` block at the **top** (lines 1–29) with the analytics-style preamble below. **Leave all the `.page`, `.toolbar`, `.badge`, `.auth-*`, `.modal-*`, `.drawer-*` rules in place** — they are removed surface-by-surface in later tasks so the app never renders unstyled mid-migration.

New top of file (the `--bg`/`--surface`/… custom-property `:root` block and the old `* {}`/`body {}` are removed; the `.container` utility and Figtree theme are added):

```css
@import '@fontsource/figtree/400.css';
@import '@fontsource/figtree/500.css';
@import '@fontsource/figtree/600.css';
@import '@fontsource/figtree/700.css';
@import '@fontsource/figtree/800.css';
@import 'tailwindcss';
/* Design tokens */
@import '@govtech-bb/design';

/* Scan compiled DS output + the shared admin-ui source for class names */
@source "../../../../node_modules/@govtech-bb/react/dist/**/*.{js,cjs}";
@source "../../../../packages/admin-ui/src/**/*.{ts,tsx}";

@theme {
  --font-sans: 'Figtree', ui-sans-serif, system-ui, sans-serif;
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
}
```

Verify the relative `@source` paths resolve: `app.css` lives at `apps/feature_flagging/app/styles/`, so four `../` reach the repo root. Confirm with:

Run: `ls apps/feature_flagging/app/styles/../../../../packages/admin-ui/src`
Expected: lists `SiteHeader.tsx`, `index.ts`, etc. (proves the path is correct).

- [ ] **Step 4: Restyle the login page**

Replace the JSX in `apps/feature_flagging/app/routes/login.tsx` (the `LoginPage` component's `return`, and its imports). Keep the route definition, `SearchSchema`, and `signIn` exactly as-is. Add imports:

```tsx
import { SiteHeader } from "@govtech-bb/admin-ui";
import { Button } from "@govtech-bb/react";
```

Replace the `LoginPage` return block with:

```tsx
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader label="Service visibility" />
      <div className="flex-1 flex items-center justify-center p-m">
        <div className="w-full max-w-[460px] rounded-md border border-grey-00 bg-white-00 p-m text-center">
          <h1 className="m-0 mb-xs text-h3 font-bold">Service visibility</h1>
          <p className="mt-0 mb-xm text-caption text-mid-grey-00">
            Sign in with GitHub to view and manage the visibility of government
            services.
          </p>

          {denied && (
            <p className="mb-s rounded-sm border border-red-40 bg-red-10 px-s py-xs text-left text-caption text-red-00">
              You don&rsquo;t have access to this tool. Ask an admin to add you
              to the access team, then try again.
            </p>
          )}
          {error === "csrf" && (
            <p className="mb-s rounded-sm border border-red-40 bg-red-10 px-s py-xs text-left text-caption text-red-00">
              Your sign-in link expired or didn&rsquo;t match. Please sign in
              again.
            </p>
          )}

          <Button
            type="button"
            className="w-full"
            onClick={() => void signIn(denied)}
          >
            {denied ? "Try a different account" : "Sign in with GitHub"}
          </Button>
        </div>
      </div>
    </div>
  );
```

Note: `rounded-md`/`rounded-sm` are Tailwind defaults; if the DS overrides radii, keep whatever the token set defines — the exact radius is not load-bearing. `border-red-40` is the token border tint.

- [ ] **Step 5: Verify the build compiles**

Run: `pnpm exec nx run feature-flagging-app:build`
Expected: build succeeds (proves deps resolve, Tailwind processes `app.css`, `SiteHeader`/`Button` type-check and bundle).

- [ ] **Step 6: Verify the existing test suite still passes**

Run: `pnpm exec nx run feature-flagging-app:test`
Expected: PASS (logic specs untouched).

- [ ] **Step 7: Visual check**

Run: `pnpm --filter @govtech-bb/feature-flagging-app dev` (serves on `http://localhost:3005`), open `/login`.
Expected: blue GovBB site bar with the wordmark + "Service visibility"; centered white card with a teal primary "Sign in with GitHub" button; Figtree font. Append `?error=denied` to confirm the red error box renders. Stop the dev server when done.

- [ ] **Step 8: Commit**

```bash
git add apps/feature_flagging/package.json apps/feature_flagging/vite.config.ts apps/feature_flagging/app/styles/app.css apps/feature_flagging/app/routes/login.tsx pnpm-lock.yaml
git commit -m "feat(feature_flagging): adopt design system + restyle login"
```

---

### Task 3: Restyle the services page header + toolbar

**Files:**
- Modify: `apps/feature_flagging/app/routes/index.tsx` (imports; page wrapper, header, sub, toolbar)

**Interfaces:**
- Consumes: `SiteHeader` from `@govtech-bb/admin-ui`. All existing hooks/handlers (`update`, `onQueryChange`, filters, `login`, `logoutSession`) are reused verbatim.

- [ ] **Step 1: Add imports**

In `apps/feature_flagging/app/routes/index.tsx` add near the top:

```tsx
import { SiteHeader } from "@govtech-bb/admin-ui";
```

- [ ] **Step 2: Replace the page wrapper + header + sub + toolbar**

Replace the opening of the `ServicesPage` return — from `<div className="page">` through the end of the `<div className="toolbar">…</div>` block — with the following. The `SiteHeader` carries the identity + sign-out; the in-content `<h1>` is dropped (the bar already names the tool) and replaced by the description line, so "Service visibility" does not read twice.

```tsx
  return (
    <>
      <SiteHeader label="Service visibility">
        <span className="text-mid-grey-00">
          {login} ·{" "}
          <button
            type="button"
            className="text-white-00 underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-100"
            onClick={() =>
              void logoutSession().then(() => window.location.assign("/"))
            }
          >
            Sign out
          </button>
        </span>
      </SiteHeader>

      <div className="container max-w-[1100px] py-m">
        <p className="mt-0 mb-xm text-caption text-mid-grey-00">
          {isFiltered
            ? `Showing ${visible.length} of ${rows.length} services.`
            : `${rows.length} services.`}{" "}
          Changing a status writes to the service_status audit log against your
          GitHub login.
        </p>

        <div className="mb-s flex flex-wrap gap-xs">
          <input
            type="search"
            placeholder="Search by title, slug or category…"
            value={qInput}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Search services"
            className="min-w-[220px] flex-1 rounded-sm border border-grey-00 bg-white-00 px-s py-xs text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-100"
          />
          <select
            value={categoryFilter}
            onChange={(e) => update({ category: e.target.value })}
            aria-label="Filter by category"
            className="rounded-sm border border-grey-00 bg-white-00 px-s py-xs text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-100"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => update({ type: e.target.value })}
            aria-label="Filter by type"
            className="rounded-sm border border-grey-00 bg-white-00 px-s py-xs text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-100"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => update({ status: e.target.value as StatusFilter })}
            aria-label="Filter by status"
            className="rounded-sm border border-grey-00 bg-white-00 px-s py-xs text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-100"
          >
            <option value="all">All statuses</option>
            {SERVICE_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
```

Note the return now opens with a fragment `<>`; the closing `</div>` of `.page` becomes `</>`. The table/modal/drawer blocks between the toolbar and the end are restyled in Tasks 4–5; leave them untouched in this task (they still reference old classes, which still exist in `app.css`). The final `)` of the component now closes with `</div></>` — verify the JSX still balances after this task (the `container` div wraps the table too; it closes at the end, replacing `.page`'s closing div).

**Balancing detail:** the old structure was `<div className="page"> … {audit && …} </div>`. New structure: `<> <SiteHeader/> <div className="container max-w-[1100px] py-m"> …toolbar…table…{pending && …}{audit && …} </div> </>`. So the single `.page` wrapper div is replaced by the `container` div, and the fragment adds the `SiteHeader` sibling.

- [ ] **Step 3: Verify build + tests**

Run: `pnpm exec nx run feature-flagging-app:build`
Expected: succeeds.
Run: `pnpm exec nx run feature-flagging-app:test`
Expected: PASS.

- [ ] **Step 4: Visual check**

Dev-serve, sign in (or, if OAuth isn't configured locally, temporarily eyeball the authenticated route per the app's local recipe). Confirm the blue bar with `{login} · Sign out` on the right, the description line, and the filter toolbar render in the design-system style. The table below may still look partly old (restyled next task).

- [ ] **Step 5: Commit**

```bash
git add apps/feature_flagging/app/routes/index.tsx
git commit -m "feat(feature_flagging): restyle services header + toolbar with SiteHeader"
```

---

### Task 4: Restyle the services table (rows, badges, status, states)

**Files:**
- Modify: `apps/feature_flagging/app/routes/index.tsx` (the `<div className="table-wrap">…</table></div>` block, the `TypeBadge` and `SortHeader` helpers)

**Interfaces:**
- Consumes: `visible`, `anim`, `saving`, `errors`, `toggleSort`, `sort`, `setPending`, `setAudit` — all existing in the component, reused unchanged.

- [ ] **Step 1: Replace the table block**

Replace the `<div className="table-wrap"> … </div>` block with the token-styled version below (structure, keys, refs, handlers unchanged — only classes change):

```tsx
      <div className="overflow-x-auto rounded-md border border-grey-00 bg-white-00">
        <table className="w-full border-collapse text-caption">
          <thead>
            <tr>
              <SortHeader label="Service" col="service" sort={sort} onSort={toggleSort} />
              <SortHeader label="Category" col="category" sort={sort} onSort={toggleSort} />
              <SortHeader label="Type" col="type" sort={sort} onSort={toggleSort} />
              <SortHeader label="Status" col="status" sort={sort} onSort={toggleSort} />
              <th className="border-b border-grey-00 bg-white-00 px-s py-xs" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.slug} ref={anim.register(row.slug)}>
                <td className="border-b border-grey-00 px-s py-xs align-middle">
                  <div className="font-bold">{row.title}</div>
                  <div className="font-mono text-caption-sm text-mid-grey-00">
                    {row.slug}
                  </div>
                  {errors[row.slug] && (
                    <div className="mt-xxs text-caption-sm text-red-00">
                      {errors[row.slug]}
                    </div>
                  )}
                </td>
                <td className="border-b border-grey-00 px-s py-xs align-middle">
                  {row.category ?? "—"}
                </td>
                <td className="border-b border-grey-00 px-s py-xs align-middle">
                  <TypeBadge row={row} />
                  {row.orphan && (
                    <span className="ml-xxs inline-block whitespace-nowrap rounded-full border border-red-40 px-xs py-[2px] text-caption-sm text-red-00">
                      Orphan
                    </span>
                  )}
                </td>
                <td className="border-b border-grey-00 px-s py-xs align-middle">
                  <select
                    className={`rounded-sm border border-grey-00 bg-white-00 px-xs py-[6px] text-caption disabled:opacity-50 ${STATUS_TEXT[row.status]}`}
                    value={row.status}
                    disabled={saving[row.slug]}
                    onChange={(e) => {
                      const next = e.target.value as ServiceStatus;
                      if (next !== row.status) setPending({ row, next });
                    }}
                    aria-label={`Status for ${row.title}`}
                  >
                    {SERVICE_STATUS_VALUES.map((s) => (
                      <option
                        key={s}
                        value={s}
                        disabled={s === "form_disabled" && !row.hasForm}
                      >
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border-b border-grey-00 px-s py-xs align-middle">
                  <button
                    type="button"
                    className="cursor-pointer border-0 bg-transparent p-0 text-blue-100 underline hover:no-underline"
                    onClick={() => setAudit({ slug: row.slug, title: row.title })}
                  >
                    History
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-m py-m text-center text-mid-grey-00">
                  No services match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
```

- [ ] **Step 2: Add the status-colour map + restyle `TypeBadge`/`SortHeader`**

Above the `ServicesPage` component (module scope, after the imports), add the status→text-colour map:

```tsx
// Status option text colour, using the darkest token in each family for
// on-white contrast.
const STATUS_TEXT: Record<ServiceStatus, string> = {
  enabled: "text-green-00",
  form_disabled: "text-yellow-00",
  disabled: "text-red-00",
};
```

Replace `TypeBadge`:

```tsx
function TypeBadge({ row }: { row: ServiceRow }) {
  const label = serviceTypeLabel(row);
  if (!label) return null;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-xs py-[2px] text-caption-sm ${
        row.hasForm
          ? "border-blue-40 text-blue-100"
          : "border-grey-00 text-mid-grey-00"
      }`}
    >
      {label}
    </span>
  );
}
```

Replace `SortHeader` (the `<th>` and its sort button):

```tsx
function SortHeader({
  label,
  col,
  sort,
  onSort,
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === col;
  return (
    <th
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className="border-b border-grey-00 bg-white-00 px-s py-xs text-left text-caption-sm font-normal uppercase tracking-wide text-mid-grey-00"
    >
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-xxs border-0 bg-transparent p-0 font-[inherit] uppercase tracking-[inherit] text-inherit hover:text-black-00"
        onClick={() => onSort(col)}
      >
        {label}
        <span className="text-[10px] opacity-70">
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
```

- [ ] **Step 3: Verify build + tests**

Run: `pnpm exec nx run feature-flagging-app:build` → succeeds.
Run: `pnpm exec nx run feature-flagging-app:test` → PASS.

- [ ] **Step 4: Visual check**

Dev-serve the authenticated services view. Confirm: bordered card table, uppercase sortable headers with the ▲/▼/↕ indicator, mono slugs, blue "Content + Form" / grey badges, red "Orphan" pill, status select coloured green/amber/red, red "History" link, and the "No services match" empty state.

- [ ] **Step 5: Commit**

```bash
git add apps/feature_flagging/app/routes/index.tsx
git commit -m "feat(feature_flagging): restyle services table with design tokens"
```

---

### Task 5: Restyle the confirm modal + audit drawer, delete dead app.css rules

**Files:**
- Modify: `apps/feature_flagging/app/routes/index.tsx` (`ConfirmStatusChange`)
- Modify: `apps/feature_flagging/app/routes/-audit-drawer.tsx`
- Modify: `apps/feature_flagging/app/styles/app.css` (remove all now-unused rules)

**Interfaces:**
- Consumes: `Button` from `@govtech-bb/react`; `STATUS_TEXT` map (Task 4) for the status colours in the modal.

- [ ] **Step 1: Restyle `ConfirmStatusChange`**

In `index.tsx`, ensure `Button` is imported (`import { Button } from "@govtech-bb/react";` — add if not already present from an earlier task). Replace `ConfirmStatusChange`'s return:

```tsx
  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black-00/40 p-xm"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[460px] rounded-md border border-grey-00 bg-white-00 p-xm"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm status change"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-s mt-0 text-h4 font-bold">Change service status?</h2>
        <p className="mb-s text-caption">
          <strong>{row.title}</strong>
          <br />
          <span className="font-mono text-caption-sm text-mid-grey-00">
            {row.slug}
          </span>
        </p>
        <p className="mb-s text-caption">
          Status will change from{" "}
          <span className={STATUS_TEXT[row.status]}>
            {STATUS_LABELS[row.status]}
          </span>{" "}
          to <span className={STATUS_TEXT[next]}>{STATUS_LABELS[next]}</span>.
        </p>
        <p className="rounded-sm border border-yellow-40 bg-yellow-10 px-s py-xs text-caption">
          This changes what the public can see for this service. The change is
          saved immediately, but the public site caches service statuses for up
          to 60 seconds — so it can take a little over a minute to appear live.
        </p>
        <div className="mt-xm flex justify-end gap-xs">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm}>
            Change status
          </Button>
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 2: Restyle the audit drawer**

Replace the return in `-audit-drawer.tsx` (structure, `role`, handlers, `formatWhen` unchanged — only classes):

```tsx
  return (
    <div
      className="fixed inset-0 flex justify-end bg-black-00/35"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="h-full w-[min(440px,100%)] overflow-y-auto bg-white-00 p-xm shadow-[-8px_0_24px_rgba(0,0,0,0.12)]"
        role="dialog"
        aria-label={`History for ${title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-xxs flex items-center justify-between">
          <h2 className="m-0 text-h4 font-bold">History</h2>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-blue-100 underline hover:no-underline"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="font-mono text-caption-sm text-mid-grey-00">{slug}</p>

        {error && <p className="text-caption-sm text-red-00">{error}</p>}
        {!error && entries === null && (
          <p className="py-m text-center text-mid-grey-00">Loading…</p>
        )}
        {!error && entries?.length === 0 && (
          <p className="py-m text-center text-mid-grey-00">
            No changes recorded yet.
          </p>
        )}
        {entries && entries.length > 0 && (
          <ul className="m-0 mt-s list-none p-0">
            {entries.map((e, i) => (
              <li
                className="relative border-l-2 border-grey-00 pb-s pl-s"
                key={`${e.changedAt}-${i}`}
              >
                <div className="text-caption-sm text-mid-grey-00">
                  {formatWhen(e.changedAt)}
                </div>
                <div className="my-[2px] font-bold">
                  {e.oldState ? STATUS_LABELS[e.oldState] : "—"} →{" "}
                  {STATUS_LABELS[e.newState]}
                </div>
                <div className="text-caption text-mid-grey-00">by {e.author}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
```

- [ ] **Step 3: Delete the now-dead `app.css` rules**

Every hand-written class is now replaced by utilities. In `apps/feature_flagging/app/styles/app.css`, delete **all** rules below the preamble written in Task 2 — i.e. remove everything from `.page {` through the end of file (`.page`, `.page-head`, `.page-sub`, `.who`, `.toolbar*`, `.table-wrap`, `table`/`th`/`td`, `button.th-sort`, `.sort-ind`, `.svc-*`, `.badge*`, `select.status*`, `.status-*`, `.linklike`, `.row-error`, all `.drawer-*`/`.audit-*`, `.empty`, `.auth-*`, `.btn-*`, all `.modal-*`). The file should end after the `.container { … }` block.

Sanity-check nothing still references a removed class:

Run: `grep -rnE "className=\"[^\"]*(page|toolbar|table-wrap|svc-|badge|status-|linklike|row-error|drawer|audit-|auth-|btn-|modal)" apps/feature_flagging/app`
Expected: **no matches** (empty output). If anything matches, that surface wasn't fully migrated — fix it before continuing.

- [ ] **Step 4: Verify build + tests**

Run: `pnpm exec nx run feature-flagging-app:build` → succeeds.
Run: `pnpm exec nx run feature-flagging-app:test` → PASS.

- [ ] **Step 5: Visual check**

Dev-serve. Trigger a status change → confirm the modal (teal/grey `Button`s, yellow warning box, coloured old→new status). Click "History" → confirm the slide-over drawer renders with the timeline. Press ESC → drawer closes.

- [ ] **Step 6: Commit**

```bash
git add apps/feature_flagging/app/routes/index.tsx apps/feature_flagging/app/routes/-audit-drawer.tsx apps/feature_flagging/app/styles/app.css
git commit -m "feat(feature_flagging): restyle modal + audit drawer, remove legacy CSS"
```

---

### Task 6: Full monorepo build, final verification, open PR

**Files:** none (verification + PR only).

- [ ] **Step 1: Full build (all packages except landing)**

Run: `pnpm exec nx run-many -t build --exclude=landing`
Expected: every project compiles — proves `@govtech-bb/admin-ui` resolves for `feature-flagging-app` and nothing else regressed. (`landing` is excluded because its prebuild needs a live external API; CI builds it.)

- [ ] **Step 2: Run the touched projects' tests**

Run: `pnpm exec nx run-many -t test --projects=admin-ui,feature-flagging-app`
Expected: PASS.

- [ ] **Step 3: End-to-end visual pass**

Dev-serve `feature-flagging-app`; walk login → services list → filter/search → sort → status change + confirm modal → audit drawer → sign out. Confirm the whole app reads as the analytics design system (Figtree, blue `SiteHeader`, tokenised controls) with no leftover grey/`--bg` styling. Optionally screenshot login + services for the PR.

- [ ] **Step 4: Push and open the PR against `main`**

```bash
git push -u origin feat-shared-admin-ui-chrome
gh pr create --base main \
  --title "feat: shared admin-ui SiteHeader + feature_flagging design-system restyle" \
  --label enhancement --label area:frontend --label subsystem:packages \
  --body "$(cat <<'EOF'
## What
- New `@govtech-bb/admin-ui` workspace package with a shared, presentational `SiteHeader` (the compact blue GovBB site bar), extracted/generalised from analytics' header.
- `apps/feature_flagging` adopts the Government of Barbados design system (`@govtech-bb/design` tokens, `@govtech-bb/react`, Figtree, Tailwind v4), matching `apps/analytics`. Every surface (login, header, services table, filters, status, confirm modal, audit drawer) is restyled with tokens/utilities and the hand-written `app.css` rules are retired.

## Why
Bring feature_flagging's login + header (and, per scope, the whole UI) in line with the analytics look, and extract the reusable chrome so both apps can share it.

## Scope notes
- `apps/analytics` is intentionally **unchanged**; it can adopt `SiteHeader` later as a drop-in.
- Behaviour is preserved throughout (OAuth flow, optimistic status change + rollback, FLIP row animation, debounced/URL-synced filters, ESC-to-close). Restyle only.
- Deviations from the DS component set (documented): raw token-styled controls instead of DS `Search`/`Select`/`Input`, and no `StatusBanner`, because those don't fit the compact analytics look / live-filter behaviour. `Logo` and `Button` are used from `@govtech-bb/react`.

## Verification
- `pnpm exec nx run-many -t build --exclude=landing` ✅
- `pnpm exec nx run-many -t test --projects=admin-ui,feature-flagging-app` ✅
- Manual walkthrough of login + services flows.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Confirm CI is green** on the PR; address any failures.

---

## Self-review notes

- **Spec coverage:** shared package (T1), DS wiring (T2), login (T2), header (T3), services page/toolbar (T3), table/badges/status (T4), modal (T5), drawer (T5), app.css retirement (T5), analytics untouched (no task modifies it), verification + PR (T6). All spec surfaces covered.
- **Deviation from spec's component picks:** the spec's per-surface table named DS `Search`/`Select`/`StatusBanner`; this plan uses token-styled raw controls + `Button` instead, for faithfulness to analytics' actual (utility-first) approach and because `Search` is submit-only and `StatusBanner`'s variants are phase labels. Recorded here and in the PR body.
- **Type consistency:** `SiteHeader({label, homeHref?, children?})` used identically in T1/T2/T3; `STATUS_TEXT` defined in T4, reused in T5; `Button`/`Logo` prop usage matches the DS `.d.ts` (`Button` requires `children`, accepts `variant`, `onClick`, `className`).
