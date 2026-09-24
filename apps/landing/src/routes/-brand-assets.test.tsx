import { readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const publicFile = (name: string) =>
  fileURLToPath(new URL(`../../public/${name}`, import.meta.url))
const packageAsset = (name: string) =>
  createRequire(import.meta.url).resolve(
    `@govtech-bb/frontend/assets/images/${name}`,
  )

it('keeps the landing social image at 1200 × 630 within its SEO budget', () => {
  const path = publicFile('og-image.png')
  const bytes = readFileSync(path)
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630])
  expect(statSync(path).size).toBeLessThanOrEqual(120_000)
})

// The icons are copies of the design-system files so they can sit on the
// conventional root paths; this fails when a DS bump changes them.
it.each([
  ['favicon.ico', 'favicon.ico'],
  ['favicon.svg', 'favicon.svg'],
  ['apple-touch-icon.png', 'govbb-icon-180.png'],
  ['icon-192.png', 'govbb-icon-192.png'],
  ['icon-512.png', 'govbb-icon-512.png'],
])('public/%s matches the design-system %s', (copy, source) => {
  expect(
    readFileSync(publicFile(copy)).equals(readFileSync(packageAsset(source))),
  ).toBe(true)
})

// The crest and logo are landing-owned copies so they can be optimised or
// swapped for a screen version without a design-system release.
it('ships the brand SVGs under public/images with the logo optimised', () => {
  for (const name of ['govbb-crest.svg', 'govbb-logo.svg']) {
    expect(readFileSync(publicFile(`images/${name}`), 'utf8')).toMatch(/^<svg /)
  }
  expect(
    statSync(publicFile('images/govbb-logo.svg')).size,
  ).toBeLessThanOrEqual(12_000)
})

it('links the root icons and the static manifest from the root head', async () => {
  const { Route } = await import('./__root')
  const head = Route.options.head as (arg: unknown) => {
    links: Array<Record<string, string>>
  }
  const { links } = head({})
  expect(links).toEqual(
    expect.arrayContaining([
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '192x192',
        href: '/icon-192.png',
      },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
    ]),
  )
  const manifest = JSON.parse(
    readFileSync(publicFile('manifest.json'), 'utf8'),
  ) as {
    icons: Array<{ src: string }>
  }
  expect(manifest.icons.map((i) => i.src)).toEqual([
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/icon-512.png',
  ])
}, 60_000)
