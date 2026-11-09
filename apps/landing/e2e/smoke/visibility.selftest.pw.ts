import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { UNAVAILABLE_NOTICES } from './api-v2-smoke'
import type { SmokeEnv } from './api-v2-smoke'
import {
  checkGatedPage,
  checkGatedStart,
  checkPreviewHidden,
} from './visibility'

// Proves the visibility checks fail when they should (#3143), against a local
// server standing in for landing. A real server, not `page.route`, because
// `page.request` bypasses routing.

type Fixture = { status?: number; source?: string; body: string }

const FORMS = 'https://forms.test'
const [UPGRADING, CLOSED] = UNAVAILABLE_NOTICES
const banner = (notice: string) =>
  `<div class="govbb-status-banner"><p>${notice}</p></div>`
const api = 'api_v2'

const fixtures: Record<string, Fixture> = {
  '/gated': { source: api, body: banner(UPGRADING) },
  '/closed': { source: api, body: banner(CLOSED) },
  '/no-banner': { source: api, body: '<p>About this service.</p>' },
  '/notice-in-copy': { source: api, body: `<p>${UPGRADING}</p>` },
  '/fallback': { source: 'static-fallback', body: banner(UPGRADING) },
  '/start-link': {
    source: api,
    body: `${banner(UPGRADING)}<a data-start-link href="/elsewhere">Start now</a>`,
  },
  '/form-link': {
    source: api,
    body: `${banner(UPGRADING)}<a href="${FORMS}/forms/x">Start now</a>`,
  },
  '/step-link': {
    source: api,
    body: `${banner(UPGRADING)}<a href="/step-link/start">Apply online</a>`,
  },
  '/open/start': { source: api, body: '<a href="#">Start now</a>' },
  '/static-only': { source: 'static', body: '<h1>A preview page</h1>' },
}

function serve(): Promise<Server> {
  const server = createServer((request, response) => {
    const fixture = fixtures[new URL(request.url ?? '/', 'http://x').pathname]
    response.writeHead(fixture?.status ?? (fixture ? 200 : 404), {
      'content-type': 'text/html',
      ...(fixture?.source && { 'x-content-source': fixture.source }),
    })
    response.end(
      `<!doctype html><html><body><main>${fixture?.body ?? '<h1>Not found</h1>'}</main></body></html>`,
    )
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server)),
  )
}

/** api_v2 with no public page anywhere, or one at every URL. */
const noPage = async () => Response.json({}, { status: 404 })
const anyPage = async (url: string) =>
  Response.json({
    url: new URL(url).searchParams.get('url'),
    form_id: null,
    body_markdown: '',
  })

let landing: Server
let env: SmokeEnv

test.use({ navigationTimeout: 5_000 })

test.beforeAll(async () => {
  landing = await serve()
  const port = (landing.address() as AddressInfo).port
  env = {
    landing: `http://127.0.0.1:${port}`,
    apiV2: 'https://api-v2.test',
    forms: FORMS,
    formsApi: 'unused',
  }
})

test.afterAll(() => {
  landing.close()
})

const gated = (url: string) => ({ url, formId: 'x' })

test('passes a gated page with its banner and no Start link', async ({
  page,
}) => {
  await checkGatedPage(page, env, 'maintenance', gated('/gated'))
  await checkGatedPage(page, env, 'statusDisabled', gated('/gated'))
  await checkGatedPage(page, env, 'closed', gated('/closed'))
})

test('fails a missing banner', async ({ page }) => {
  await expect(
    checkGatedPage(page, env, 'maintenance', gated('/no-banner')),
  ).rejects.toThrow(`/no-banner has no "${UPGRADING}" banner`)
})

test("fails another state's notice", async ({ page }) => {
  await expect(
    checkGatedPage(page, env, 'closed', gated('/gated')),
  ).rejects.toThrow(`/gated has no "${CLOSED}" banner`)
})

test('fails the notice in body copy, outside the banner', async ({ page }) => {
  await expect(
    checkGatedPage(page, env, 'maintenance', gated('/notice-in-copy')),
  ).rejects.toThrow('/notice-in-copy has no')
})

for (const url of ['/start-link', '/form-link', '/step-link']) {
  test(`fails a visible Start link (${url})`, async ({ page }) => {
    await expect(
      checkGatedPage(page, env, 'maintenance', gated(url)),
    ).rejects.toThrow(`${url} shows a Start link to x`)
  })
}

test('fails a gated page served from static', async ({ page }) => {
  await expect(
    checkGatedPage(page, env, 'maintenance', gated('/fallback')),
  ).rejects.toThrow('/fallback: x-content-source: static-fallback')
})

test('passes a gated /start that 404s, fails one served', async ({
  request,
}) => {
  await checkGatedStart(request, env, '/gated/start')
  await expect(checkGatedStart(request, env, '/open/start')).rejects.toThrow(
    '/open/start: HTTP 200, not 404',
  )
})

test('passes a preview page nothing serves', async ({ request }) => {
  await checkPreviewHidden(request, env, '/preview', noPage)
})

test('fails a preview page landing serves from static', async ({ request }) => {
  await expect(
    checkPreviewHidden(request, env, '/static-only', noPage),
  ).rejects.toThrow(
    '/static-only: HTTP 200 (x-content-source: static), not 404',
  )
})

test('fails a preview page api_v2 serves without the token', async ({
  request,
}) => {
  await expect(
    checkPreviewHidden(request, env, '/preview', anyPage),
  ).rejects.toThrow('/preview: api_v2 serves it without the preview token')
})
