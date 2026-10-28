// Checks the built landing's api_v2 category reads over real HTTP (ADR 0078):
// listings, not-found fallthrough, unavailable/malformed errors, and an
// unreadable tree, and the listing server function's transport parsing. Vitest
// can't run these paths, because a Start server function needs the built
// server's RPC manifest.
//
// It starts a local stand-in for api_v2's public reads, points the existing
// build at it through Nitro's runtime override (NITRO_API_V2_URL), and requests
// pages from the build. It writes nothing anywhere.
//
// Usage, after `pnpm build`, with port 3000 free (the Amplify preset's fixed
// port; the check refuses to take it from another process):
//   node scripts/check-api-v2-categories.mjs
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { fileURLToPath } from 'node:url'

const SITE = 'http://127.0.0.1:3000'

const SERVER = fileURLToPath(
  new URL('../.amplify-hosting/compute/default/server.js', import.meta.url),
)

const SSR_ENTRY = new URL(
  '../.amplify-hosting/compute/default/_ssr/ssr.mjs',
  import.meta.url,
)

/** The listing server function's RPC id, from the build's server manifest. */
function listingRpcId() {
  const manifest = readFileSync(SSR_ENTRY, 'utf8')

  const id = manifest.match(
    /"([0-9a-f]{64})": \{\s*functionName: "getApiV2CategoryListing_createServerFn_handler"/,
  )?.[1]

  if (!id) throw new Error('the build has no getApiV2CategoryListing RPC')

  return id
}

/**
 * A browser's call to the listing server function, its `data` encoded as
 * Start's transport does (seroval JSON): strings, numbers, arrays, objects.
 */
function callListing(id, data) {
  const node = (value, ref) => {
    if (typeof value === 'string') return { t: 1, s: value }

    if (typeof value === 'number') return { t: 0, s: value }

    if (Array.isArray(value))
      return { t: 9, i: ref.next++, a: value.map((v) => node(v, ref)), o: 0 }
    const keys = Object.keys(value)

    return {
      t: 10,
      i: ref.next++,
      p: { k: keys, v: keys.map((k) => node(value[k], ref)) },
      o: 0,
    }
  }

  const payload = JSON.stringify({
    t: node({ data }, { next: 0 }),
    f: 63,
    m: [],
  })

  const query = new URLSearchParams({ payload })

  return fetch(`${SITE}/_serverFn/${id}?${query}`, {
    // Same-origin, as the browser sends it; Start's CSRF check refuses others.
    headers: {
      'x-tsr-serverFn': 'true',
      accept: 'application/json',
      'sec-fetch-site': 'same-origin',
    },
  })
}

const ref = (url, title) => ({
  slug: url.split('/').at(-1),
  url,
  title,
  description: `${title} description`,
})

const PARENT = ref('/check-parent', 'Check parent')

const CHILD = ref('/check-parent/check-child', 'Check child')

const TREE = {
  categories: [
    { ...PARENT, subcategories: [CHILD] },
    { ...ref('/check-broken', 'Check broken'), subcategories: [] },
    { ...ref('/check-down', 'Check down'), subcategories: [] },
    { ...ref('/check-gone', 'Check gone'), subcategories: [] },
  ],
}

const LISTINGS = {
  '/categories/check-parent': {
    category: PARENT,
    parent: null,
    subcategories: [CHILD],
    pages: [
      {
        url: '/check-parent/direct-service',
        title: 'Direct service',
        description: null,
        digital: false,
      },
    ],
  },
  '/categories/check-parent/check-child': {
    category: CHILD,
    parent: PARENT,
    subcategories: [],
    pages: [
      {
        url: '/check-parent/check-child/nested-service',
        title: 'Nested service',
        description: null,
        digital: true,
      },
    ],
  },
}

const GONE_PAGE = {
  url: '/check-gone',
  frontmatter: { title: 'A page where a category was' },
  body_markdown: 'Served as a page.',
  form_id: null,
  hide_start_links: false,
  breadcrumbs: [{ name: 'A page where a category was', url: '/check-gone' }],
  published_at: null,
  updated_at: '2026-10-27T00:00:00.000Z',
}

const fallbackPage = (url) => ({
  ...GONE_PAGE,
  url,
  frontmatter: { title: `Fallback page at ${url}` },
  breadcrumbs: [{ name: `Fallback page at ${url}`, url }],
})

// A page exists at each category address, so the checks prove whether the
// page was used (after a 404) or not (after a failed category read).
// Ordinary text with HTML-significant characters, as an editor may type it.
const LT_PAGE_TITLE = 'Fees < 100 & over'

const LT_CATEGORY_NAME = 'Grants < 5 years'

const LT_PAGE = {
  ...GONE_PAGE,
  url: '/check-parent/lt-service',
  frontmatter: { title: LT_PAGE_TITLE, description: 'Under < over' },
  breadcrumbs: [
    { name: LT_CATEGORY_NAME, url: '/check-parent' },
    { name: LT_PAGE_TITLE, url: '/check-parent/lt-service' },
  ],
}

const FALLBACK_PAGES = {
  '/check-parent/lt-service': LT_PAGE,
  '/check-gone': GONE_PAGE,
  '/check-broken': fallbackPage('/check-broken'),
  '/check-down': fallbackPage('/check-down'),
}

/** What the stand-in's tree read answers: the tree, or an outage. */
let treeMode = 'ok'

const requests = []

const api = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://api')
  requests.push({
    path: url.pathname,
    query: url.searchParams.get('url'),
    headers: request.headers,
  })

  const send = (status, body) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  }

  if (url.pathname === '/categories') {
    return treeMode === 'ok'
      ? send(200, TREE)
      : send(500, { error: 'internal_error' })
  }

  if (url.pathname in LISTINGS) return send(200, LISTINGS[url.pathname])

  if (url.pathname === '/categories/check-broken')
    return send(200, { category: 'x' })

  if (url.pathname === '/categories/check-down')
    return send(503, { error: 'internal_error' })
  const pageAt = url.searchParams.get('url')

  if (url.pathname === '/pages' && pageAt in FALLBACK_PAGES) {
    return send(200, FALLBACK_PAGES[pageAt])
  }

  return send(404, { error: 'not_found' })
})

const results = []

function check(name, ok, detail = '') {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`)
}

const get = async (path) => {
  const response = await fetch(`${SITE}${path}`, { redirect: 'manual' })

  return { status: response.status, html: await response.text() }
}

/**
 * Whether the rendered `<main>` has a link to `href` reading `name`. Serialized
 * loader data sits in a script outside `<main>`, so this can't be fooled by a
 * title that is fetched but never rendered.
 */
function mainLinks(html, href, name) {
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? ''

  return [...main.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].some(
    (m) => m[1] === href && m[2].replace(/<[^>]+>/g, '').trim() === name,
  )
}

/**
 * The `<li>` rows of the one `<ul>` in `<main>` that links to every href, or
 * null. Rows of one list share the established divider (`border-t-2`, none on
 * the first); split across two lists, each row is a first row with no border.
 */
function sharedListRows(html, hrefs) {
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? ''

  const list = [...main.matchAll(/<ul[^>]*>([\s\S]*?)<\/ul>/g)]
    .map((m) => m[1])
    .find((body) => hrefs.every((href) => body.includes(`href="${href}"`)))

  if (list === undefined) return null

  return [...list.matchAll(/<li([^>]*)>/g)].map((m) => m[1])
}

function trailOf(html) {
  const nav =
    html.match(/<nav[^>]*aria-label="Breadcrumb"[\s\S]*?<\/nav>/)?.[0] ?? ''

  return [...nav.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim(),
  )
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

async function waitForSite() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await portInUse(3000)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('the built landing did not start on :3000')
}

if (await portInUse(3000)) {
  console.error(
    'Port 3000 is in use; stop that process first. Nothing was started.',
  )
  process.exit(2)
}

await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve))

const base = `http://127.0.0.1:${api.address().port}`

const site = spawn(process.execPath, [SERVER], {
  env: { ...process.env, NITRO_API_V2_URL: base },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let siteLog = ''

site.stdout.on('data', (chunk) => (siteLog += chunk))

site.stderr.on('data', (chunk) => (siteLog += chunk))

try {
  await waitForSite()

  const parent = await get('/check-parent')
  check('category is 200', parent.status === 200, String(parent.status))
  check(
    'category renders its direct service link',
    mainLinks(parent.html, '/check-parent/direct-service', 'Direct service'),
  )
  check(
    'category renders its subcategory link too',
    mainLinks(parent.html, '/check-parent/check-child', 'Check child'),
  )

  const rows = sharedListRows(parent.html, [
    '/check-parent/check-child',
    '/check-parent/direct-service',
  ])

  check(
    'subcategory and direct service are rows of one divided list',
    rows !== null &&
      rows.length === 2 &&
      rows.every((attrs) => /border-t-2/.test(attrs)),
    JSON.stringify(rows),
  )
  check(
    'category trail is Home only',
    JSON.stringify(trailOf(parent.html)) === JSON.stringify(['Home']),
    JSON.stringify(trailOf(parent.html)),
  )

  const child = await get('/check-parent/check-child')
  check(
    'subcategory is 200 and renders its service link',
    child.status === 200 &&
      mainLinks(
        child.html,
        '/check-parent/check-child/nested-service',
        'Nested service',
      ),
  )
  // Services only: the established full-width service listing (divider rows
  // in a <div>), not the measure-capped <ul> a mixed listing uses.
  const childMain = child.html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? ''

  const serviceRow = childMain.match(
    /<div class="([^"]*)"><a[^>]*href="\/check-parent\/check-child\/nested-service"/,
  )?.[1]

  check(
    'a services-only listing keeps the service list rows, not a <ul>',
    serviceRow !== undefined &&
      /border-t-2/.test(serviceRow) &&
      !/<ul[\s>]/.test(childMain.slice(0, childMain.indexOf('nested-service'))),
    serviceRow ?? 'no service-list row',
  )
  check(
    'subcategory trail is Home › parent',
    JSON.stringify(trailOf(child.html)) ===
      JSON.stringify(['Home', 'Check parent']),
    JSON.stringify(trailOf(child.html)),
  )

  const gone = await get('/check-gone')
  check(
    'a listed category that is now not found falls through to its page',
    gone.status === 200 && gone.html.includes('A page where a category was'),
    String(gone.status),
  )

  for (const path of ['/check-broken', '/check-down']) {
    const pageReads = () =>
      requests.filter((r) => r.path === '/pages' && r.query === path).length

    const before = pageReads()
    const failed = await get(path)
    check(
      `${path} shows the error page, not its fallback page, a listing or 404`,
      failed.status === 500 &&
        failed.html.includes('Something went wrong') &&
        !failed.html.includes(`Fallback page at ${path}`),
      String(failed.status),
    )
    check(`${path} never reads its fallback page`, pageReads() === before)
  }

  // JSON-LD is inline script text: a literal `<` must not reach it, and the
  // escaped JSON must still parse back to the names api_v2 sent.
  const lt = await get('/check-parent/lt-service')

  const ldScripts = [
    ...lt.html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => m[1])

  const ld = ldScripts.map((text) => JSON.parse(text))
  const service = ld.find((item) => item['@type'] === 'GovernmentService')
  const trail = ld.find((item) => item['@type'] === 'BreadcrumbList')
  check(
    'JSON-LD script text has no literal <',
    lt.status === 200 &&
      service !== undefined &&
      trail !== undefined &&
      ldScripts.every((text) => !text.includes('<')),
    `${lt.status} ${ldScripts.filter((text) => text.includes('<')).length} with <`,
  )
  check(
    'JSON-LD parses back to the original page and category names',
    service?.name === LT_PAGE_TITLE &&
      service?.description === 'Under < over' &&
      JSON.stringify(trail?.itemListElement.map((item) => item.name)) ===
        JSON.stringify(['Home', LT_CATEGORY_NAME, LT_PAGE_TITLE]),
    JSON.stringify(trail?.itemListElement.map((item) => item.name)),
  )

  const legacy = await get('/youth-and-community')
  check(
    'a static category api_v2 does not list is a 404',
    legacy.status === 404,
    String(legacy.status),
  )

  // An unreadable tree: each server-rendered request reads it afresh.
  treeMode = 'down'
  const home = await get('/')
  check(
    'home says categories are unavailable, listing none',
    home.status === 200 &&
      home.html.includes('show the service categories right now') &&
      !home.html.includes('href="/check-parent"') &&
      !home.html.includes('href="/youth-and-community"'),
    String(home.status),
  )
  const app = await get('/health-and-emergency-services/water-outages')
  check(
    'an app route still renders, without its unreadable category',
    app.status === 200 &&
      !trailOf(app.html).includes('Health and emergency services'),
    `${app.status} ${JSON.stringify(trailOf(app.html))}`,
  )
  const listingDuringOutage = await get('/check-parent')
  check(
    'a category still loads by its own read when the tree is down',
    listingDuringOutage.status === 200 &&
      mainLinks(
        listingDuringOutage.html,
        '/check-parent/direct-service',
        'Direct service',
      ),
    String(listingDuringOutage.status),
  )
  const sitemap = await get('/sitemap.xml')
  check(
    'sitemap keeps pages and app routes, with no categories',
    sitemap.status === 200 &&
      sitemap.html.includes('/services</loc>') &&
      sitemap.html.includes(
        '/health-and-emergency-services/find-an-open-pharmacy/find</loc>',
      ) &&
      !sitemap.html.includes('/check-parent</loc>') &&
      !sitemap.html.includes('/youth-and-community</loc>'),
    String(sitemap.status),
  )

  // The transport: a well-formed call reads the listing; a malformed one is
  // refused before any api_v2 request.
  const id = listingRpcId()

  const listingReads = () =>
    requests.filter((r) => r.path.startsWith('/categories/')).length

  const good = await callListing(id, ['check-parent'])
  check(
    'a well-formed transport call reads the listing',
    good.status === 200 && (await good.text()).includes('Direct service'),
    String(good.status),
  )

  for (const [label, data] of [
    ['three segments', ['check-parent', 'check-child', 'x']],
    ['no segments', []],
    ['a number', [1]],
    ['a bare string', 'check-parent'],
    ['an object', { 0: 'check-parent' }],
  ]) {
    const before = listingReads()
    const response = await callListing(id, data)
    const body = await response.text()
    check(
      `a transport call with ${label} is refused before api_v2`,
      // Start returns a validator failure as a serialized error (200 with no
      // result), not a status; the Zod issue proves it was the path parse that
      // refused it, not the CSRF check.
      response.status === 200 &&
        body.includes('invalid_union') &&
        listingReads() === before,
      String(response.status),
    )
  }

  check(
    'only public reads: no editor route, preview token or cookie',
    requests.length > 0 &&
      requests.every(
        ({ path, headers }) =>
          !path.startsWith('/editor') &&
          !headers['x-preview-token'] &&
          !headers.cookie,
      ),
    `${requests.length} requests`,
  )
} finally {
  site.kill()
  api.close()
}

const failed = results.filter((ok) => !ok).length

console.log(`${results.length - failed}/${results.length} passed`)

if (failed) console.log(siteLog.slice(-2000))

process.exitCode = failed ? 1 : 0
