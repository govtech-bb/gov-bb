import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// docs/analytics/event-catalogue.md lists every event for whoever builds the
// Umami and Datadog dashboards (#3518). This fails when a TrackingData key in
// @govtech-bb/analytics has no row there, so a new event can't ship
// undocumented. It lives here, not in the analytics package, because that
// package is built for the browser and has no Node types to read files with.

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')

// The top-level keys of an interface, read from its source. Prettier indents
// them by two spaces; the data types nested inside go deeper.
function interfaceKeys(source: string, name: string): string[] {
  const body = new RegExp(
    `^export interface ${name}\\b[^{]*\\{\\n([\\s\\S]*?)^\\}`,
    'm',
  ).exec(source)
  if (!body) throw new Error(`interface ${name} not found`)
  return [...body[1].matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z][\w-]*))\??:/gm)].map(
    (m) => m[1] ?? m[2],
  )
}

const ANALYTICS = '../../../../packages/analytics/src/'
const keys = [
  ...interfaceKeys(read(`${ANALYTICS}index.ts`), 'TrackingData'),
  ...interfaceKeys(read(`${ANALYTICS}tool-events.ts`), 'ToolTrackingData'),
]

// A row starts with the event name in code: | `form-start` | …
const catalogued = new Set(
  [
    ...read('../../../../docs/analytics/event-catalogue.md').matchAll(
      /^\|\s*`([^`]+)`\s*\|/gm,
    ),
  ].map((m) => m[1]),
)

describe('event catalogue', () => {
  it('reads the TrackingData keys from source', () => {
    expect(keys).toEqual(
      expect.arrayContaining([
        'form-start',
        'search',
        'chat-answer',
        'tool-result',
      ]),
    )
  })

  it.each(keys)('lists %s', (key) => {
    expect(
      catalogued.has(key),
      `add a row for ${key} to docs/analytics/event-catalogue.md`,
    ).toBe(true)
  })
})
