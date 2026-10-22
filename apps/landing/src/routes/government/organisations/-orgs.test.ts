import { expect, it } from 'vitest'
import { findPage } from '../../../content/registry'
import { ORGS } from './-orgs'

// Every on-platform link each organisation record makes, wherever it sits.
const LINKS = ORGS.flatMap((org) =>
  [...JSON.stringify(org).matchAll(/"href":"(\/[^"]*)"/g)].map(
    ([, href]) => [org.slug, href] as const,
  ),
)

it.each(LINKS)('%s links %s to a page that exists', (_slug, href) => {
  expect(findPage(href)).toBeDefined()
})
