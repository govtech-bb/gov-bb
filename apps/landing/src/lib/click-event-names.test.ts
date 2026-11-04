import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_EVENT_NAME_LENGTH } from './analytics'

// installClickListener sends every data-umami-event value to Umami, which cuts
// names off at 50 characters (#3502). A name built from a slug or form id can
// grow past that as content is added, so names must be fixed strings, with the
// varying part sent as data-umami-event-* data instead.
const SRC = fileURLToPath(new URL('..', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : []
  })
}

const tags = sourceFiles(SRC).flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(/data-umami-event=(\S+)/g)].map(
    (m) => ({ file: relative(SRC, file), value: m[1] }),
  ),
)

describe('data-umami-event names in landing', () => {
  it('finds the tagged elements', () => {
    expect(tags.length).toBeGreaterThan(0)
  })

  it.each(tags)(
    '$file: $value is a fixed name of at most 50 characters',
    ({ value }) => {
      const literal = /^"([^"]*)"$/.exec(value)
      expect(literal, 'use a fixed string, not an expression').not.toBeNull()
      expect(literal![1].length).toBeLessThanOrEqual(MAX_EVENT_NAME_LENGTH)
    },
  )
})
