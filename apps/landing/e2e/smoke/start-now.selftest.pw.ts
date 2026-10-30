import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import type { SmokeEnv } from './api-v2-smoke'
import { walkStartChain } from './start-now'

// Proves walkStartChain fails when it should (#3144), against local servers
// standing in for landing and forms. The pages copy what the deployed landing
// renders: a Start link is a plain anchor to the forms origin, and a form_id
// that names no public form gets no link at all (StartLink.tsx).

type Fixture = { status?: number; source?: string; body: string }

const html = (body: string) =>
  `<!doctype html><html><body><main>${body}</main></body></html>`

function serve(fixtures: Record<string, Fixture>): Promise<Server> {
  const server = createServer((request, response) => {
    const fixture = fixtures[new URL(request.url ?? '/', 'http://x').pathname]
    response.writeHead(fixture?.status ?? (fixture ? 200 : 404), {
      'content-type': 'text/html',
      ...(fixture?.source && { 'x-content-source': fixture.source }),
    })
    response.end(fixture ? html(fixture.body) : html('<h1>Not found</h1>'))
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server)),
  )
}

const url = (server: Server) =>
  `http://127.0.0.1:${(server.address() as AddressInfo).port}`

let landing: Server
let forms: Server
let env: SmokeEnv

test.use({ navigationTimeout: 5_000 })

const NOTICE =
  'This form is currently being upgraded to serve you better. Please check back soon.'

/** A chain whose every page is bound to `formId`. */
const chain = (path: string[], formId: string) => ({
  path,
  pageFormIds: path.map(() => formId),
  formId,
})

test.beforeAll(async () => {
  // A form's first step: the forms app adds `?step=` once the recipe loads.
  const step = `<script>history.replaceState(null, '', '?step=first')</script>`
  forms = await serve({
    '/forms/good-form': {
      body: `<h1>Tell us about yourself</h1><button>Continue</button>${step}`,
    },
    '/forms/one-step': {
      body: `<h1>Your feedback</h1><button>Submit</button>${step}`,
    },
    '/forms/gone-form': { body: '<h1>Form not found</h1>' },
  })
  const formsUrl = url(forms)
  const api = 'api_v2'
  landing = await serve({
    '/service': {
      source: api,
      body: '<a href="/service/start">Apply online</a>',
    },
    '/service/start': {
      source: api,
      body: `<a href="${formsUrl}/forms/good-form">Start now</a>`,
    },
    '/one-step': {
      source: api,
      body: `<a href="${formsUrl}/forms/one-step">Start now</a>`,
    },
    '/typo': { source: api, body: '<p>There is 1 way to apply.</p>' },
    '/maintenance': {
      source: api,
      body: `<div class="govbb-status-banner"><p>${NOTICE}</p></div>`,
    },
    '/notice-in-copy': { source: api, body: `<p>${NOTICE}</p>` },
    '/gone': {
      source: api,
      body: `<a href="${formsUrl}/forms/gone-form">Start now</a>`,
    },
    '/fallback': {
      source: 'static-fallback',
      body: '<a href="/service/start">Apply online</a>',
    },
  })
  env = { landing: url(landing), apiV2: 'unused', forms: formsUrl }
})

test.afterAll(() => {
  landing.close()
  forms.close()
})

test('opens the form through the start step', async ({ page }) => {
  await expect(
    walkStartChain(
      page,
      env,
      chain(['/service', '/service/start'], 'good-form'),
    ),
  ).resolves.toBe('opened')
})

test('opens a one-step form, whose button is Submit', async ({ page }) => {
  await expect(
    walkStartChain(page, env, chain(['/one-step'], 'one-step')),
  ).resolves.toBe('opened')
})

test('passes a form landing marks as under maintenance', async ({ page }) => {
  await expect(
    walkStartChain(page, env, chain(['/maintenance'], 'x')),
  ).resolves.toBe('unavailable')
})

test('fails a maintenance banner for a different form', async ({ page }) => {
  await expect(
    walkStartChain(page, env, {
      path: ['/maintenance'],
      pageFormIds: ['other-form'],
      formId: 'x',
    }),
  ).rejects.toThrow('/maintenance: unavailable banner for other-form, not x')
})

test('fails the notice words in body copy, outside the banner', async ({
  page,
}) => {
  await expect(
    walkStartChain(page, env, chain(['/notice-in-copy'], 'x')),
  ).rejects.toThrow('/notice-in-copy has no Start link')
})

test('fails a form_id that names no form', async ({ page }) => {
  await expect(
    walkStartChain(page, env, chain(['/typo'], 'no-such-form')),
  ).rejects.toThrow('/typo has no Start link')
})

test('fails a Start link whose form does not load', async ({ page }) => {
  await expect(
    walkStartChain(page, env, chain(['/gone'], 'gone-form')),
  ).rejects.toThrow(/Timeout/)
})

test('fails a step landing served from static', async ({ page }) => {
  await expect(
    walkStartChain(
      page,
      env,
      chain(['/fallback', '/service/start'], 'good-form'),
    ),
  ).rejects.toThrow('/fallback: x-content-source: static-fallback')
})
