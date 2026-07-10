# Real-time per-form analytics SSR dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/analytics` to fetch Umami data server-side in real time (no DB, no committed snapshot), showing a slim site overview + form list, with each form's funnel/journey/submit-error loaded on click.

**Architecture:** `apps/analytics` becomes a self-contained TanStack Start (Nitro) SSR app — the stack `landing` uses. Server functions call Umami directly (key in Amplify SSR runtime config). Per-form funnels come from Umami's `POST /reports/funnel`, journeys from `POST /reports/journey`; the site overview from `/stats` + `/metrics`; the form list from the forms API `GET /form-definitions`. A ~60s in-memory TTL memo dedupes calls.

**Tech Stack:** TanStack Start, Nitro (`aws_amplify` preset), React 19, Vite, Tailwind v4, `@govtech-bb/react` design system, Vitest 4, nx.

## Global Constraints

- Package manager: **pnpm** only.
- Branch: `feat-consolidated-analytics-dashboard` (the existing PR); push there.
- Node runtime for SSR: `nodejs24.x` (match landing).
- API key + website IDs live in **Nitro runtime config** (build-baked from env), read via `useRuntimeConfig()` — never `import.meta.env`/client, never a `VITE_`-prefixed name (those inline into the client bundle).
- Umami Cloud rate limit 50 req/15s — reuse `UmamiClient`'s 330ms throttle + retry.
- Funnel counts distinct **visitors** (Umami semantics), not sessions.
- Verify before build: run `pnpm exec nx run-many -t build --exclude=landing` and the touched projects' tests.

---

### Task 1: Add funnel/journey report methods to `@govtech-bb/umami-analytics`

**Files:**
- Modify: `packages/umami-analytics/src/umami.ts`
- Modify: `packages/umami-analytics/src/types.ts`
- Test: `packages/umami-analytics/src/umami.spec.ts` (create)

**Interfaces:**
- Produces:
  - `interface FunnelStepInput { type: 'event' | 'path'; value: string }`
  - `interface FunnelStepResult { type: string; value: string; visitors: number; dropped?: number; dropoff: number | null }`
  - `interface JourneyPath { items: string[]; count: number }`
  - `UmamiClient.reportFunnel(websiteId, { steps: FunnelStepInput[]; window: number; range: Range }): Promise<FunnelStepResult[]>`
  - `UmamiClient.reportJourney(websiteId, { steps: number; startStep?: string; endStep?: string; range: Range }): Promise<JourneyPath[]>`

- [ ] **Step 1: Write failing tests** in `packages/umami-analytics/src/umami.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { UmamiClient } from './umami'

const range = { startAt: 1000, endAt: 2000 }

function mockFetchOnce(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response)
}

describe('UmamiClient.reportFunnel', () => {
  it('POSTs the funnel envelope and returns the step rows', async () => {
    const fetchSpy = mockFetchOnce([
      { type: 'event', value: 'f:form-start', visitors: 100, dropoff: null },
      { type: 'event', value: 'f:form-submit', visitors: 40, dropped: 60, dropoff: 0.6 },
    ])
    vi.stubGlobal('fetch', fetchSpy)
    const client = new UmamiClient({ apiKey: 'k' })
    const rows = await client.reportFunnel('w1', {
      steps: [
        { type: 'event', value: 'f:form-start' },
        { type: 'event', value: 'f:form-submit' },
      ],
      window: 60,
      range,
    })
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ value: 'f:form-submit', visitors: 40 })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('/reports/funnel')
    expect(init.method).toBe('POST')
    const sent = JSON.parse(init.body as string)
    expect(sent).toMatchObject({
      websiteId: 'w1',
      type: 'funnel',
      parameters: {
        window: 60,
        steps: [
          { type: 'event', value: 'f:form-start' },
          { type: 'event', value: 'f:form-submit' },
        ],
      },
    })
    expect(sent.parameters.startDate).toBeTruthy()
    expect(sent.parameters.endDate).toBeTruthy()
    vi.unstubAllGlobals()
  })
})

describe('UmamiClient.reportJourney', () => {
  it('POSTs the journey envelope and returns paths', async () => {
    const fetchSpy = mockFetchOnce([{ items: ['/', '/a'], count: 12 }])
    vi.stubGlobal('fetch', fetchSpy)
    const client = new UmamiClient({ apiKey: 'k' })
    const paths = await client.reportJourney('w1', { steps: 5, range })
    expect(paths[0]).toMatchObject({ items: ['/', '/a'], count: 12 })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('/reports/journey')
    expect(init.method).toBe('POST')
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm exec nx run umami-analytics:test`
Expected: FAIL — `reportFunnel is not a function`.

- [ ] **Step 3: Add types** to `packages/umami-analytics/src/types.ts` (append):

```ts
/** One requested funnel step (Umami `parameters.steps[]`). */
export interface FunnelStepInput {
  type: "event" | "path";
  value: string;
}

/** One row of the funnel report response. */
export interface FunnelStepResult {
  type: string;
  value: string;
  visitors: number;
  /** absent on the first step */
  dropped?: number;
  /** null on the first step; fraction 0–1 thereafter */
  dropoff: number | null;
}

/** One journey path row. */
export interface JourneyPath {
  items: string[];
  count: number;
}
```

- [ ] **Step 4: Implement** in `packages/umami-analytics/src/umami.ts`. Add a private `post()` mirroring `get()` (throttle + retry), import the new types, and add the two methods. Insert after the private `get()` method:

```ts
  private async post<T>(
    path: string,
    body: unknown,
    attempt = 0,
  ): Promise<T> {
    await this.throttle();
    const url = new URL(`${this.baseUrl}${path}`);
    const MAX_RETRIES = 3;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "x-umami-api-key": this.apiKey,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        return this.post<T>(path, body, attempt + 1);
      }
      throw err;
    }
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        return this.post<T>(path, body, attempt + 1);
      }
      const text = await res.text().catch(() => "");
      throw new Error(
        `Umami ${res.status} ${res.statusText} for ${path} — ${text.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  }

  /** Distinct-visitor funnel for a list of ordered steps (event names or paths). */
  reportFunnel(
    websiteId: string,
    opts: { steps: FunnelStepInput[]; window: number; range: Range },
  ): Promise<FunnelStepResult[]> {
    return this.post<FunnelStepResult[]>(`/reports/funnel`, {
      websiteId,
      type: "funnel",
      parameters: {
        startDate: new Date(opts.range.startAt).toISOString(),
        endDate: new Date(opts.range.endAt).toISOString(),
        steps: opts.steps,
        window: opts.window,
      },
    });
  }

  /** Top navigation paths (journey report). */
  reportJourney(
    websiteId: string,
    opts: { steps: number; startStep?: string; endStep?: string; range: Range },
  ): Promise<JourneyPath[]> {
    return this.post<JourneyPath[]>(`/reports/journey`, {
      websiteId,
      type: "journey",
      parameters: {
        startDate: new Date(opts.range.startAt).toISOString(),
        endDate: new Date(opts.range.endAt).toISOString(),
        steps: opts.steps,
        ...(opts.startStep ? { startStep: opts.startStep } : {}),
        ...(opts.endStep ? { endStep: opts.endStep } : {}),
      },
    });
  }
```

Add the type import at the top of `umami.ts`:
```ts
import type { EventDataValue, ExpandedRow, MetricRow, FunnelStepInput, FunnelStepResult, JourneyPath } from "./types";
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec nx run umami-analytics:test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/umami-analytics/src/umami.ts packages/umami-analytics/src/types.ts packages/umami-analytics/src/umami.spec.ts
git commit -m "feat(umami-analytics): add reportFunnel/reportJourney report-endpoint methods"
```

---

### Task 2: Retire the session-crawl code from the package

**Files:**
- Delete: `packages/umami-analytics/src/sessions.ts`, `packages/umami-analytics/src/sessions.spec.ts`, `packages/umami-analytics/src/report.ts` (package one, if present)
- Modify: `packages/umami-analytics/src/umami.ts` (remove crawl methods), `packages/umami-analytics/src/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `UmamiClient` without `collectSessions`/`listSessions`/`sessionActivity`/`sessionsPage`.

- [ ] **Step 1: Delete crawl files**

```bash
git rm packages/umami-analytics/src/sessions.ts packages/umami-analytics/src/sessions.spec.ts
git rm packages/umami-analytics/src/report.ts 2>/dev/null || true
```

- [ ] **Step 2: Remove crawl methods** from `umami.ts` — delete `sessionsPage`, `listSessions`, `sessionActivity`, `collectSessions` and the `ActivityRow, RawSession, SessionWithActivity` import line.

- [ ] **Step 3: Fix exports** in `index.ts` — remove any `export * from "./sessions"` / `"./report"` lines (current index exports only `types/dates/metrics/umami`, so likely no change; confirm).

- [ ] **Step 4: Verify the package builds + tests**

Run: `pnpm exec nx run umami-analytics:build && pnpm exec nx run umami-analytics:test`
Expected: PASS (no references to deleted symbols remain).

- [ ] **Step 5: Commit**

```bash
git add -A packages/umami-analytics
git commit -m "refactor(umami-analytics): drop session-crawl code, superseded by report endpoints"
```

---

### Task 3: Convert `apps/analytics` to a TanStack Start SSR shell

**Files:**
- Modify: `apps/analytics/package.json`, `apps/analytics/vite.config.ts`, `apps/analytics/project.json`, `apps/analytics/tsconfig.json`
- Create: `apps/analytics/src/router.tsx`, `apps/analytics/src/routes/__root.tsx`, `apps/analytics/src/routes/index.tsx`
- Delete: `apps/analytics/index.html`, `apps/analytics/src/main.tsx`

**Interfaces:**
- Produces: an SSR app that renders `AnalyticsPage` at `/`; build emits `apps/analytics/.amplify-hosting`.

- [ ] **Step 1: Update `package.json`** — add TanStack Start / Nitro deps (copy versions from `apps/landing/package.json`: `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/router-plugin`, `@tanstack/react-router-ssr-query`, `@tanstack/react-query`, `@tanstack/devtools-vite`, `nitro`), set scripts to match landing:

```json
"scripts": {
  "dev": "vite dev --port 3100",
  "build": "vite build",
  "preview": "nitro preview",
  "start": "node .amplify-hosting/compute/default/server.js",
  "test": "vitest run",
  "lint": "eslint",
  "typecheck": "tsc --noEmit"
}
```
Remove the `generate:analytics` script.

- [ ] **Step 2: Rewrite `vite.config.ts`** modeled on landing (no `markdown()` plugin), with `runtimeConfig` holding the three Umami values:

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  plugins: [
    tailwindcss(),
    nitro({
      config: {
        preset: 'aws_amplify',
        awsAmplify: { runtime: 'nodejs24.x' },
        // Build-baked into the server-only runtime config (never a client
        // chunk): the Amplify SSR Lambda never sees Console env vars at runtime
        // and Nitro doesn't read .env in prod. Read via useRuntimeConfig() in
        // src/lib/umami-server.ts. NOT VITE_-prefixed — that would inline the
        // secret into the browser bundle.
        runtimeConfig: {
          umamiApiKey: process.env.UMAMI_API_KEY ?? '',
          umamiLandingWebsiteId: process.env.UMAMI_LANDING_WEBSITE_ID ?? '',
          umamiFormsWebsiteId: process.env.UMAMI_FORMS_WEBSITE_ID ?? '',
          formsApiUrl: process.env.VITE_FORMS_API_URL ?? '',
        },
      },
    }),
    tanstackStart(),
    viteReact({ include: /\.(js|jsx|ts|tsx)$/ }),
  ],
})
```

- [ ] **Step 3: Create `src/router.tsx`** (minimal — no analytics tracking subscribe):

```tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
```

- [ ] **Step 4: Create `src/routes/__root.tsx`** (shell + styles; noindex like the old index.html):

```tsx
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'robots', content: 'noindex' },
      { title: 'Analytics | Government of Barbados' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
})
```

- [ ] **Step 5: Create `src/routes/index.tsx`** (loader wired in Task 5; stub now so the app builds):

```tsx
import { createFileRoute } from '@tanstack/react-router'
import AnalyticsPage from '../AnalyticsPage'

export const Route = createFileRoute('/')({
  component: AnalyticsPage,
})
```

- [ ] **Step 6: Delete SPA entry**

```bash
git rm apps/analytics/index.html apps/analytics/src/main.tsx
```

- [ ] **Step 7: Update `project.json`** — change `build` `outputs` to `["{projectRoot}/.amplify-hosting"]`.

- [ ] **Step 8: Update `tsconfig.json`** — add `"@types/node"` to `types` and keep `routeTree.gen.ts` includable (it's generated on first `vite dev`/`build`).

- [ ] **Step 9: Install + build** (AnalyticsPage still imports static `REPORT`; that's replaced in Task 5, so it may not typecheck yet — just confirm the SSR toolchain resolves):

Run: `pnpm install && pnpm exec nx run analytics-app:build`
Expected: routeTree.gen.ts generated; build proceeds past Nitro/Start setup (type errors from `REPORT` are addressed in Task 5).

- [ ] **Step 10: Commit**

```bash
git add -A apps/analytics pnpm-lock.yaml
git commit -m "build(analytics): convert app to TanStack Start SSR shell"
```

---

### Task 4: Server-side Umami data layer (client factory + TTL memo + report shaping)

**Files:**
- Create: `apps/analytics/src/lib/umami-server.ts`
- Create: `apps/analytics/src/lib/cache.ts`
- Test: `apps/analytics/src/lib/cache.spec.ts`, `apps/analytics/src/lib/umami-server.spec.ts`

**Interfaces:**
- Produces:
  - `memoize<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>`
  - `getConfig(): { apiKey: string; landingWebsiteId: string; formsWebsiteId: string; formsApiUrl: string }`
  - `type OverviewData = { stats: SiteStats; pages: PageRow[]; forms: FormListItem[] }`
  - `type FormListItem = { formId: string; title: string }`
  - `type SiteStats = { visitors: number; pageviews: number }`
  - `type FormDetailData = { funnel: FunnelStage[]; journey: JourneyPath[]; submitErrorRate: number | null }`
  - `fetchOverviewData(cfg): Promise<OverviewData>`
  - `fetchFormDetailData(cfg, formId: string): Promise<FormDetailData>`

- [ ] **Step 1: Write `cache.spec.ts`** (fake timers):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoize, __clearCache } from './cache'

afterEach(() => { __clearCache(); vi.useRealTimers() })

describe('memoize', () => {
  it('returns cached value within ttl, refetches after', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fn = async () => ++calls
    expect(await memoize('k', 1000, fn)).toBe(1)
    expect(await memoize('k', 1000, fn)).toBe(1)
    vi.advanceTimersByTime(1001)
    expect(await memoize('k', 1000, fn)).toBe(2)
  })
})
```

- [ ] **Step 2: Implement `cache.ts`**:

```ts
// Per-process in-memory TTL memo. Dedupes Umami calls across a refresh / two
// concurrent SSR requests without any persistence (no DB, no snapshot). Scope
// is one Lambda instance; a cold start starts empty, which is fine.
type Entry = { at: number; value: Promise<unknown> }
const store = new Map<string, Entry>()

export async function memoize<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>
  const value = fn().catch((err) => {
    // Don't cache failures — drop so the next request retries.
    store.delete(key)
    throw err
  })
  store.set(key, { at: Date.now(), value })
  return value as Promise<T>
}

/** test-only */
export function __clearCache() {
  store.clear()
}
```

- [ ] **Step 3: Run cache test**

Run: `pnpm exec nx run analytics-app:test -- cache`
Expected: PASS.

- [ ] **Step 4: Write `umami-server.spec.ts`** — test the two shaping functions with a stubbed client:

```ts
import { describe, expect, it } from 'vitest'
import { shapeFormDetail, buildFunnelSteps } from './umami-server'

describe('buildFunnelSteps', () => {
  it('builds start→review→submit event steps for a formId', () => {
    expect(buildFunnelSteps('birth-cert')).toEqual([
      { type: 'event', value: 'birth-cert:form-start' },
      { type: 'event', value: 'birth-cert:form-review' },
      { type: 'event', value: 'birth-cert:form-submit' },
    ])
  })
})

describe('shapeFormDetail', () => {
  it('maps funnel rows to stages with dropoff percentages', () => {
    const detail = shapeFormDetail(
      [
        { type: 'event', value: 'f:form-start', visitors: 100, dropoff: null },
        { type: 'event', value: 'f:form-review', visitors: 60, dropped: 40, dropoff: 0.4 },
        { type: 'event', value: 'f:form-submit', visitors: 45, dropped: 15, dropoff: 0.25 },
      ],
      [{ items: ['/', '/f'], count: 10 }],
      { starts: 100, errors: 9 },
    )
    expect(detail.funnel.map((s) => s.label)).toEqual(['Start', 'Review', 'Submit'])
    expect(detail.funnel[1].dropoffPct).toBe(40)
    expect(detail.submitErrorRate).toBeCloseTo(0.09)
    expect(detail.journey[0].count).toBe(10)
  })
})
```

- [ ] **Step 5: Implement `umami-server.ts`**:

```ts
import { useRuntimeConfig } from 'nitro/runtime-config'
import {
  UmamiClient,
  type FunnelStepInput,
  type FunnelStepResult,
  type JourneyPath,
  type FunnelStage,
  type PageRow,
} from '@govtech-bb/umami-analytics'
import { memoize } from './cache'

const TTL_MS = 60_000
const DEFAULT_FORMS_API = 'https://forms.api.sandbox.alpha.gov.bb'
const FUNNEL_WINDOW_MIN = 60

export interface UmamiConfig {
  apiKey: string
  landingWebsiteId: string
  formsWebsiteId: string
  formsApiUrl: string
}

export function getConfig(): UmamiConfig {
  const c = useRuntimeConfig() as Record<string, string | undefined>
  return {
    apiKey: c.umamiApiKey ?? process.env.UMAMI_API_KEY ?? '',
    landingWebsiteId:
      c.umamiLandingWebsiteId ?? process.env.UMAMI_LANDING_WEBSITE_ID ?? '',
    formsWebsiteId:
      c.umamiFormsWebsiteId ?? process.env.UMAMI_FORMS_WEBSITE_ID ?? '',
    formsApiUrl:
      c.formsApiUrl || process.env.VITE_FORMS_API_URL || DEFAULT_FORMS_API,
  }
}

export function isConfigured(cfg: UmamiConfig): boolean {
  return Boolean(cfg.apiKey && cfg.landingWebsiteId && cfg.formsWebsiteId)
}

function last30(): { startAt: number; endAt: number } {
  const endAt = Date.now()
  return { startAt: endAt - 30 * 24 * 60 * 60 * 1000, endAt }
}

export interface FormListItem { formId: string; title: string }
export interface SiteStats { visitors: number; pageviews: number }
export interface OverviewData {
  stats: SiteStats
  pages: PageRow[]
  forms: FormListItem[]
}
export interface FormDetailData {
  funnel: FunnelStage[]
  journey: JourneyPath[]
  submitErrorRate: number | null
}

export function buildFunnelSteps(formId: string): FunnelStepInput[] {
  return [
    { type: 'event', value: `${formId}:form-start` },
    { type: 'event', value: `${formId}:form-review` },
    { type: 'event', value: `${formId}:form-submit` },
  ]
}

const STAGE_LABELS = ['Start', 'Review', 'Submit']

export function shapeFormDetail(
  funnelRows: FunnelStepResult[],
  journey: JourneyPath[],
  extra: { starts: number; errors: number },
): FormDetailData {
  const funnel: FunnelStage[] = funnelRows.map((row, i) => ({
    label: STAGE_LABELS[i] ?? row.value,
    count: row.visitors,
    dropoffPct: row.dropoff == null ? 0 : Math.round(row.dropoff * 1000) / 10,
  }))
  const submitErrorRate = extra.starts ? extra.errors / extra.starts : null
  return { funnel, journey, submitErrorRate }
}

async function fetchFormList(cfg: UmamiConfig): Promise<FormListItem[]> {
  const base = cfg.formsApiUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}/form-definitions`)
  if (!res.ok) return []
  const body = (await res.json()) as {
    data?: { formId: string; title: string }[]
  }
  return (body.data ?? []).map((f) => ({ formId: f.formId, title: f.title }))
}

export async function fetchOverviewData(cfg: UmamiConfig): Promise<OverviewData> {
  return memoize('overview', TTL_MS, async () => {
    const client = new UmamiClient({ apiKey: cfg.apiKey })
    const range = last30()
    const [statsRaw, urls, forms] = await Promise.all([
      client.stats(cfg.landingWebsiteId, range) as Promise<{
        pageviews?: { value?: number }
        visitors?: { value?: number }
      }>,
      client.metricsUrls(cfg.landingWebsiteId, range),
      fetchFormList(cfg),
    ])
    const pages: PageRow[] = urls
      .map((r) => ({
        path: r.x ?? r.name ?? '',
        pageviews: r.pageviews ?? r.y ?? 0,
        visitors: r.visitors ?? 0,
        topSources: [],
      }))
      .sort((a, b) => b.pageviews - a.pageviews)
      .slice(0, 10)
    return {
      stats: {
        visitors: statsRaw.visitors?.value ?? 0,
        pageviews: statsRaw.pageviews?.value ?? 0,
      },
      pages,
      forms: forms.sort((a, b) => a.title.localeCompare(b.title)),
    }
  })
}

export async function fetchFormDetailData(
  cfg: UmamiConfig,
  formId: string,
): Promise<FormDetailData> {
  return memoize(`form:${formId}`, TTL_MS, async () => {
    const client = new UmamiClient({ apiKey: cfg.apiKey })
    const range = last30()
    const [funnelRows, journey, events] = await Promise.all([
      client.reportFunnel(cfg.formsWebsiteId, {
        steps: buildFunnelSteps(formId),
        window: FUNNEL_WINDOW_MIN,
        range,
      }),
      client.reportJourney(cfg.formsWebsiteId, { steps: 5, range }),
      client.metricsEvents(cfg.formsWebsiteId, range),
    ])
    const starts =
      events.find((e) => e.x === `${formId}:form-start`)?.y ?? 0
    const errors =
      events.find((e) => e.x === `${formId}:form-submit-error`)?.y ?? 0
    return shapeFormDetail(funnelRows, journey, { starts, errors })
  })
}
```

Note: `metricsEvents` currently returns all events for the website; `x`/`y` are the event name/count. `stats()` returns `unknown` today — cast at call site as above. If the real `/stats` shape differs, adjust the accessor (verify point).

- [ ] **Step 6: Run tests**

Run: `pnpm exec nx run analytics-app:test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/analytics/src/lib/cache.ts apps/analytics/src/lib/cache.spec.ts apps/analytics/src/lib/umami-server.ts apps/analytics/src/lib/umami-server.spec.ts
git commit -m "feat(analytics): server-side real-time Umami data layer with TTL memo"
```

---

### Task 5: Server functions + wire the route loader + per-form fetch

**Files:**
- Rewrite: `apps/analytics/src/lib/report.ts` → server functions (`fetchOverview`, `fetchFormDetail`)
- Modify: `apps/analytics/src/routes/index.tsx` (loader), `apps/analytics/src/AnalyticsPage.tsx`
- Delete: `apps/analytics/src/content/analytics-snapshot.json`, `apps/analytics/scripts/generate-analytics-snapshot.ts`
- Test: `apps/analytics/src/AnalyticsPage.test.tsx` (update)

**Interfaces:**
- Consumes: `fetchOverviewData`, `fetchFormDetailData`, `getConfig`, `isConfigured` (Task 4).
- Produces:
  - `fetchOverview = createServerFn({method:'GET'}).handler(): Promise<OverviewPayload>` where `OverviewPayload = { configured: boolean } & OverviewData`
  - `fetchFormDetail = createServerFn({method:'GET'}).inputValidator((id:unknown)=>String(id)).handler(): Promise<FormDetailData>`

- [ ] **Step 1: Rewrite `src/lib/report.ts`** as server functions:

```ts
import { createServerFn } from '@tanstack/react-start'
import {
  fetchOverviewData,
  fetchFormDetailData,
  getConfig,
  isConfigured,
  type OverviewData,
  type FormDetailData,
} from './umami-server'

export type OverviewPayload = { configured: boolean } & OverviewData

const EMPTY_OVERVIEW: OverviewPayload = {
  configured: false,
  stats: { visitors: 0, pageviews: 0 },
  pages: [],
  forms: [],
}

export const fetchOverview = createServerFn({ method: 'GET' }).handler(
  async (): Promise<OverviewPayload> => {
    const cfg = getConfig()
    if (!isConfigured(cfg)) return EMPTY_OVERVIEW
    try {
      const data = await fetchOverviewData(cfg)
      return { configured: true, ...data }
    } catch {
      return EMPTY_OVERVIEW
    }
  },
)

export const fetchFormDetail = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => String(raw))
  .handler(async ({ data: formId }): Promise<FormDetailData> => {
    const cfg = getConfig()
    if (!isConfigured(cfg)) {
      return { funnel: [], journey: [], submitErrorRate: null }
    }
    try {
      return await fetchFormDetailData(cfg, formId)
    } catch {
      return { funnel: [], journey: [], submitErrorRate: null }
    }
  })
```

- [ ] **Step 2: Wire the loader** in `src/routes/index.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import AnalyticsPage from '../AnalyticsPage'
import { fetchOverview } from '../lib/report'

export const Route = createFileRoute('/')({
  loader: () => fetchOverview(),
  component: AnalyticsPage,
})
```

- [ ] **Step 3: Rewrite `AnalyticsPage.tsx`** to consume loader data + fetch form detail on click. Replace the static `REPORT` import and the preset selector with the overview payload; keep the design-system layout (overview stats, top pages, form list, click-drawer). On drawer open, call `fetchFormDetail({ data: formId })` and render funnel + journey + submit-error. Remove field-error / validation-reason / search sections. Full component:

```tsx
import { Heading, Text } from '@govtech-bb/react'
import * as React from 'react'
import { Route } from '../routes/index'
import { fetchFormDetail } from './lib/report'
import type { FormDetailData } from './lib/umami-server'

const fmtInt = (n: number) => n.toLocaleString()
const fmtPct = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}%`

const TH = 'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'
const CARD = 'overflow-x-auto rounded-lg border border-grey-00'

export default function AnalyticsPage() {
  const overview = Route.useLoaderData()
  const [activeForm, setActiveForm] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<FormDetailData | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function openForm(formId: string) {
    setActiveForm(formId)
    setDetail(null)
    setLoading(true)
    try {
      setDetail(await fetchFormDetail({ data: formId }))
    } finally {
      setLoading(false)
    }
  }

  if (!overview.configured) {
    return (
      <div className="container py-8">
        <Heading as="h1" size="h1">Umami Analytics</Heading>
        <Text as="p" className="mt-s text-mid-grey-00">
          Analytics is not configured — set UMAMI_API_KEY,
          UMAMI_LANDING_WEBSITE_ID and UMAMI_FORMS_WEBSITE_ID on the deployment.
        </Text>
      </div>
    )
  }

  const activeTitle = overview.forms.find((f) => f.formId === activeForm)?.title ?? activeForm

  return (
    <div className="container py-8">
      <header className="mb-l">
        <Heading as="h1" size="h1">Umami Analytics</Heading>
        <Text as="p" size="caption" className="text-mid-grey-00">
          Live — last 30 days · {fmtInt(overview.stats.visitors)} visitors ·{' '}
          {fmtInt(overview.stats.pageviews)} pageviews
        </Text>
      </header>

      <section className="mb-l">
        <Heading as="h2" size="h3" className="mb-s">Top pages</Heading>
        <div className={CARD}>
          <table className="min-w-full">
            <thead><tr>
              <th className={TH}>Path</th>
              <th className={`${TH} ${NUM}`}>Pageviews</th>
              <th className={`${TH} ${NUM}`}>Visitors</th>
            </tr></thead>
            <tbody>
              {overview.pages.map((p) => (
                <tr key={p.path}>
                  <td className={TD}>{p.path}</td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(p.pageviews)}</td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(p.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-l">
        <Heading as="h2" size="h3" className="mb-s">Forms</Heading>
        <div className={CARD}>
          <table className="min-w-full">
            <thead><tr><th className={TH}>Form</th><th className={TH}></th></tr></thead>
            <tbody>
              {overview.forms.map((f) => (
                <tr
                  key={f.formId}
                  tabIndex={0}
                  onClick={() => openForm(f.formId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openForm(f.formId) }
                  }}
                  className={`cursor-pointer hover:bg-teal-10 ${activeForm === f.formId ? 'bg-teal-10' : ''}`}
                >
                  <td className={TD}><Text as="span" size="caption" weight="bold">{f.title}</Text></td>
                  <td className={`${TD} ${NUM} text-mid-grey-00`}>View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {activeForm ? (
        <>
          <button
            type="button"
            aria-label="Close details"
            className="fixed inset-0 z-40 bg-black-00/40"
            onClick={() => setActiveForm(null)}
          />
          <aside className="fixed top-0 right-0 z-50 h-full w-[min(580px,94vw)] overflow-y-auto border-l border-grey-00 bg-white-00 p-l shadow-2xl">
            <button
              type="button"
              onClick={() => setActiveForm(null)}
              className="float-right rounded-md border border-grey-00 px-s py-xs text-caption"
            >Close ✕</button>
            <Heading as="h3" size="h4">{activeTitle}</Heading>
            <Text as="p" size="small-caption" className="mb-s text-mid-grey-00">{activeForm}</Text>
            {loading || !detail ? (
              <Text as="p" className="text-mid-grey-00">{loading ? 'Loading…' : 'No data.'}</Text>
            ) : (
              <FormDetailBody detail={detail} />
            )}
          </aside>
        </>
      ) : null}
    </div>
  )
}

function FormDetailBody({ detail }: { detail: FormDetailData }) {
  const max = Math.max(1, ...detail.funnel.map((s) => s.count))
  return (
    <>
      {detail.submitErrorRate != null ? (
        <Text as="p" size="caption" className="mt-s">
          Submit-error rate: <b>{fmtPct(detail.submitErrorRate * 100)}</b>
        </Text>
      ) : null}

      <Text as="span" size="caption" weight="bold" className="mt-m mb-xs block uppercase tracking-wide text-mid-grey-00">Funnel</Text>
      <div className="flex max-w-[560px] flex-col gap-xs">
        {detail.funnel.map((s) => (
          <div key={s.label} className="grid grid-cols-[90px_1fr_130px] items-center gap-s text-caption">
            <span>{s.label}</span>
            <span className="rounded bg-teal-10">
              <span className="block h-[22px] min-w-[2px] rounded bg-teal-00" style={{ width: `${(100 * s.count) / max}%` }} />
            </span>
            <span className={NUM}>
              {fmtInt(s.count)}
              {s.dropoffPct ? <span className="text-red-00"> -{fmtPct(s.dropoffPct)}</span> : null}
            </span>
          </div>
        ))}
      </div>

      <Text as="span" size="caption" weight="bold" className="mt-m mb-xs block uppercase tracking-wide text-mid-grey-00">Top journeys</Text>
      {detail.journey.length === 0 ? (
        <Text as="p" size="caption" className="text-mid-grey-00">No journey data.</Text>
      ) : (
        <div className={CARD}>
          <table className="min-w-full">
            <thead><tr><th className={TH}>Path</th><th className={`${TH} ${NUM}`}>Count</th></tr></thead>
            <tbody>
              {detail.journey.map((j, i) => (
                <tr key={i}>
                  <td className={TD}>{j.items.join(' › ')}</td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(j.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Delete snapshot + generator**

```bash
git rm apps/analytics/src/content/analytics-snapshot.json apps/analytics/scripts/generate-analytics-snapshot.ts
rmdir apps/analytics/src/content apps/analytics/scripts 2>/dev/null || true
```

- [ ] **Step 5: Update `AnalyticsPage.test.tsx`** — render with a mocked `Route.useLoaderData` returning `{ configured: true, stats, pages, forms }` and assert the form list renders + the unconfigured state shows the setup message. Minimal:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/routes/index', () => ({
  Route: { useLoaderData: () => ({
    configured: true,
    stats: { visitors: 10, pageviews: 20 },
    pages: [{ path: '/', pageviews: 20, visitors: 10, topSources: [] }],
    forms: [{ formId: 'birth-cert', title: 'Get a birth certificate' }],
  }) },
}))
vi.mock('../src/lib/report', () => ({ fetchFormDetail: vi.fn() }))

import AnalyticsPage from '../src/AnalyticsPage'

describe('AnalyticsPage', () => {
  it('renders the form list from loader data', () => {
    render(<AnalyticsPage />)
    expect(screen.getByText('Get a birth certificate')).toBeTruthy()
    expect(screen.getByText('Top pages')).toBeTruthy()
  })
})
```

(Adjust the mock path to match the test's location; the existing test file is at `apps/analytics/src/AnalyticsPage.test.tsx`, so mock `'./routes/index'` and `'./lib/report'`.)

- [ ] **Step 6: Typecheck, test, build**

Run: `pnpm exec nx run analytics-app:typecheck && pnpm exec nx run analytics-app:test && pnpm exec nx run analytics-app:build`
Expected: PASS; build emits `apps/analytics/.amplify-hosting`.

- [ ] **Step 7: Commit**

```bash
git add -A apps/analytics
git commit -m "feat(analytics): real-time SSR dashboard — overview + per-form funnel/journey on click"
```

---

### Task 6: Amplify SSR deploy config + docs

**Files:**
- Modify: `amplify.yml` (analytics block)
- Modify: `apps/analytics/README.md`

**Interfaces:** none (infra + docs).

- [ ] **Step 1: Update the analytics block in `amplify.yml`** — change the artifact from static `dist` to the Nitro Amplify output, matching the landing block:

```yaml
  - appRoot: apps/analytics
    frontend:
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
        baseDirectory: apps/analytics/.amplify-hosting
        files:
          - "**/*"
```

(Copy the exact `baseDirectory`/compute layout landing uses at `apps/landing/.amplify-hosting`; confirm the emitted path after Task 5's build.)

- [ ] **Step 2: Rewrite `apps/analytics/README.md`** — document: real-time SSR, no snapshot, required Amplify env (`UMAMI_API_KEY`, `UMAMI_LANDING_WEBSITE_ID`, `UMAMI_FORMS_WEBSITE_ID`, `VITE_FORMS_API_URL`), and that the standalone `gov-bb-analytics` Amplify app must be switched to an SSR/compute deploy (was static).

- [ ] **Step 3: Commit**

```bash
git add amplify.yml apps/analytics/README.md
git commit -m "build(analytics): deploy app as Amplify SSR compute + doc real-time setup"
```

---

### Task 7: Full verification + push

- [ ] **Step 1: Build the workspace (excluding landing)**

Run: `pnpm exec nx run-many -t build --exclude=landing`
Expected: all projects compile.

- [ ] **Step 2: Run touched projects' tests**

Run: `pnpm exec nx run umami-analytics:test && pnpm exec nx run analytics-app:test`
Expected: PASS.

- [ ] **Step 3: Local SSR smoke** — start the built server and hit `/`:

Run: `cd apps/analytics && UMAMI_API_KEY= node .amplify-hosting/compute/default/server.js &` then `curl -s localhost:3000/ | grep -qi 'Umami Analytics'`
Expected: the page HTML renders (unconfigured message with empty env — proves SSR route + render path works without secrets).

- [ ] **Step 4: Push to the PR branch**

```bash
git push origin feat-consolidated-analytics-dashboard
```

- [ ] **Step 5: Report** the push + the manual Amplify actions still required (set the three env vars on `gov-bb-analytics`; switch that app from static hosting to SSR/compute; trigger a deploy since auto-build is off).

---

## Self-review notes

- **Spec coverage:** SSR conversion (T3), report methods (T1), server-side data layer + TTL (T4), server functions + UI (T5), retirement of snapshot/generator/crawl (T2, T5), Amplify SSR + env (T6), tests throughout, verify-points carried as inline notes. ✅
- **Verify-points from the spec** (form-definitions shape, recipe formId == event prefix, report auth header, funnel window, Amplify SSR support) are called out at their tasks; the local SSR smoke (T7 S3) and real-data check happen at execution.
- **Type consistency:** `FunnelStepResult`/`JourneyPath`/`FunnelStage` defined in T1/reused from package; `OverviewData`/`FormDetailData` defined in T4, consumed unchanged in T5.
- **Known runtime risk:** `client.stats()` returns `unknown`; the `{visitors:{value},pageviews:{value}}` accessor is the documented Umami `/stats` shape but must be confirmed against live data (noted in T4 S5).
