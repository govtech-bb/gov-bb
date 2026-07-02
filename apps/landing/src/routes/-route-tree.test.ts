import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Guards co-located feature modules under src/routes/<url>/. Each feature's
// route files become real routes while its `-meta.ts` / `-ui` / `-data` / `-lib`
// siblings are ignored by the router via TanStack's `routeFileIgnorePrefix`
// ('-'). This asserts (a) every expected feature URL is present in the committed
// route tree, and (b) the ignore-prefix held — no `-`-prefixed implementation
// file leaked into routing — which would regress if that default ever changed.
const routeTree = readFileSync(
  fileURLToPath(new URL('../routeTree.gen.ts', import.meta.url)),
  'utf8',
)

const FEATURE_URLS = [
  '/health-and-emergency-services/find-an-emergency-shelter',
  '/health-and-emergency-services/find-an-emergency-shelter/find',
  '/health-and-emergency-services/find-an-emergency-shelter/guidance',
  // StormReady is now fully content-tree — its landing AND its checklist (a
  // co-located `.tsx` content page) are served by the catch-all route, so
  // neither appears in the generated route tree.
]

describe('co-located feature routes', () => {
  it.each(FEATURE_URLS)('mounts %s in the generated route tree', (url) => {
    expect(routeTree).toContain(`'${url}'`)
  })

  it.each(['-meta', '-ui', '-data', '-lib'])(
    'never routes the ignored "%s" sibling',
    (ignored) => {
      expect(routeTree).not.toContain(ignored)
    },
  )
})
