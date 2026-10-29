import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { resolveApiV2Page } from './api-v2-page'
import type { PageResponse } from './api-v2-page'

/**
 * Contract test (#3138): landing's hand-copied `PageResponse` against the
 * `GET /pages` response in api_v2's committed openapi.json, which api_v2's own
 * openapi.test.ts keeps in step with the running app. The spec is read at
 * runtime (no cross-app import), and the `test` target lists it as an input
 * in project.json, so a change to it makes landing:test nx-affected.
 */

type Schema = {
  type?: string
  nullable?: boolean
  format?: string
  properties?: Record<string, Schema>
  required?: Array<string>
  items?: Schema
}

const spec = JSON.parse(
  readFileSync(
    new URL('../../../api_v2/openapi.json', import.meta.url),
    'utf8',
  ),
) as {
  paths: Record<
    string,
    Record<
      string,
      {
        responses: Record<
          string,
          { content: Record<string, { schema: Schema }> }
        >
      }
    >
  >
}

/** Undefined (not a TypeError) when the route or status is gone, so the
 *  "missing from api_v2's response" message names it. */
function responseSchema(status: string): Schema | undefined {
  return spec.paths['/pages']?.get?.responses[status]?.content[
    'application/json'
  ]?.schema
}

/** What landing expects of a field: its type, and whether landing's type
 *  makes it required (`?:` → optional) or allows null. */
type Field = {
  type: 'string' | 'boolean' | 'array' | 'object'
  optional?: boolean
  nullable?: boolean
  properties?: Record<string, Field>
  items?: Field
}

/** A `Field` whose `optional`/`nullable` must match landing's type `T`, so
 *  the tables below can't drift from `PageResponse`. */
type FieldOf<T> = Field &
  (undefined extends T ? { optional: true } : { optional?: false }) &
  (null extends T ? { nullable: true } : { nullable?: false })

const str = { type: 'string' } as const
const optStr = { type: 'string', optional: true } as const

// Mapped over `keyof`, so a field added to `PageResponse` without a line here
// fails landing's typecheck.
const FRONTMATTER: {
  [K in keyof PageResponse['frontmatter']]-?: FieldOf<
    PageResponse['frontmatter'][K]
  >
} = {
  lede: optStr,
  stage: optStr,
  featured: { type: 'boolean', optional: true },
  section: optStr,
  service_type: optStr,
  keywords: { type: 'array', optional: true, items: str },
  source_url: optStr,
  title: str,
  description: optStr,
}

const PAGE: { [K in keyof PageResponse]-?: FieldOf<PageResponse[K]> } = {
  url: str,
  frontmatter: { type: 'object', properties: FRONTMATTER },
  body_markdown: str,
  form_id: { type: 'string', nullable: true },
  hide_start_links: { type: 'boolean' },
  breadcrumbs: {
    type: 'array',
    items: { type: 'object', properties: { name: str, url: str } },
  },
  published_at: { type: 'string', nullable: true },
  updated_at: str,
  category: { type: 'string', nullable: true },
  subcategory: { type: 'string', nullable: true },
}

/** Every way `schema` fails to give landing what `field` expects. */
function mismatches(
  path: string,
  field: Field,
  schema?: Schema,
): Array<string> {
  if (!schema) return [`${path}: missing from api_v2's response`]
  if (schema.type !== field.type)
    return [`${path}: api_v2 says ${schema.type}, landing reads ${field.type}`]
  const problems: Array<string> = []
  if (schema.nullable && !field.nullable)
    problems.push(`${path}: api_v2 may send null, landing doesn't allow it`)
  if (field.items)
    problems.push(...mismatches(`${path}[]`, field.items, schema.items))
  for (const [key, child] of Object.entries(field.properties ?? {})) {
    const childPath = `${path}.${key}`
    if (!child.optional && !schema.required?.includes(key))
      problems.push(`${childPath}: optional in api_v2, required by landing`)
    problems.push(...mismatches(childPath, child, schema.properties?.[key]))
  }
  return problems
}

/** A value shaped like `schema`: every property filled in, or the least api_v2
 *  may send (required properties only, null where nullable). */
function sample(schema: Schema, minimal: boolean): unknown {
  if (minimal && schema.nullable) return null
  switch (schema.type) {
    case 'string':
      return schema.format === 'date-time' ? '2026-01-01T00:00:00.000Z' : 'x'
    case 'boolean':
      return false
    case 'array':
      return [sample(schema.items ?? {}, minimal)]
    case 'object':
      return Object.fromEntries(
        Object.entries(schema.properties ?? {})
          .filter(([key]) => !minimal || schema.required?.includes(key))
          .map(([key, child]) => [key, sample(child, minimal)]),
      )
    default:
      throw new Error(`no sample for schema type ${schema.type}`)
  }
}

function respond(status: number, body: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof fetch
}

describe('landing ↔ api_v2 GET /pages contract (openapi.json)', () => {
  it('every PageResponse field exists with a compatible type', () => {
    expect(
      mismatches(
        'page',
        { type: 'object', properties: PAGE },
        responseSchema('200'),
      ),
    ).toEqual([])
  })

  it('the 301 body carries the redirect target landing reads', () => {
    expect(
      mismatches(
        'redirect',
        { type: 'object', properties: { redirect: str } },
        responseSchema('301'),
      ),
    ).toEqual([])
  })

  it.each([
    ['every field', false],
    ['only required fields and nulls', true],
  ])(
    'a spec-shaped page with %s is accepted and mapped',
    async (_, minimal) => {
      const schema = responseSchema('200')
      if (!schema)
        throw new Error("GET /pages 200 is missing from api_v2's spec")
      const body = sample(schema, minimal) as PageResponse
      const result = await resolveApiV2Page(
        'http://api.example',
        '/x',
        respond(200, body),
      )
      if (result.kind !== 'page')
        throw new Error(`no page: ${JSON.stringify(result)}`)

      const { page } = result
      expect(page.frontmatter.title).toBe(body.frontmatter.title)
      expect(page.body).toBe(body.body_markdown)
      expect(page.hideStartLinks).toBe(body.hide_start_links)
      expect(page.breadcrumbs).toEqual(body.breadcrumbs)
    },
  )
})
