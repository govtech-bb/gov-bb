import { describe, expect, it } from 'vitest'
import { evaluate, renderSummary } from './budget.ts'
import type { HostResult } from './budget.ts'

const host = (
  content: [number, number],
  notFound: [number, number],
  unexpected = 0,
): HostResult => ({
  content: { p50: content[0], p95: content[1], count: 4000 },
  notFound: { p50: notFound[0], p95: notFound[1], count: 1200 },
  unexpected,
})

const staging = host([200, 300], [200, 300])
const failed = (preview: HostResult, base = staging) =>
  evaluate(preview, base)
    .filter((r) => !r.pass)
    .map((r) => r.budget)

describe('evaluate', () => {
  it('passes a run inside every budget', () => {
    expect(failed(host([250, 350], [250, 400]))).toEqual([])
  })

  it('fails content p95 at 800 ms even when staging is as slow', () => {
    expect(
      failed(host([200, 800], [200, 300]), host([200, 800], [200, 300])),
    ).toEqual(['Content p95 (#3147)'])
  })

  it('allows content p95 exactly 20% above staging, not more', () => {
    expect(failed(host([200, 360], [200, 300]))).toEqual([])
    expect(failed(host([200, 361], [200, 300]))).toEqual([
      'Content p95 vs staging (#3147)',
    ])
  })

  it('allows content p50 exactly 100 ms above staging, not more', () => {
    expect(failed(host([300, 300], [200, 300]))).toEqual([])
    expect(failed(host([301, 300], [200, 300]))).toEqual([
      'Content p50 vs staging (#3147)',
    ])
  })

  it('fails 404 p95 at 500 ms even when staging is as slow', () => {
    expect(
      failed(host([200, 300], [200, 500]), host([200, 300], [200, 500])),
    ).toEqual(['404 p95 (#3149)'])
  })

  it('allows 404 p95 exactly 150 ms above staging, not more', () => {
    expect(failed(host([200, 300], [200, 450]))).toEqual([])
    expect(failed(host([200, 300], [200, 451]))).toEqual([
      '404 p95 vs staging (#3149)',
    ])
  })

  it('fails on an unexpected status from either host', () => {
    const bad = 'Unexpected statuses (both hosts)'
    expect(failed(host([200, 300], [200, 300], 1))).toEqual([bad])
    expect(
      failed(host([200, 300], [200, 300]), host([200, 300], [200, 300], 2)),
    ).toEqual([bad])
  })

  it('fails closed when a metric is missing', () => {
    const empty = host([NaN, NaN], [NaN, NaN])
    expect(failed(empty)).toHaveLength(5)
  })
})

describe('renderSummary', () => {
  it('shows both hosts, content and 404 separately, and each budget', () => {
    const preview = host([250, 900], [250, 400])
    const md = renderSummary(evaluate(preview, staging), [
      { name: 'api_v2', url: 'https://preview', result: preview },
      { name: 'static', url: 'https://staging', result: staging },
    ])
    expect(md).toContain(
      '| api_v2 (https://preview) | content | 4000 | 250 ms | 900 ms |',
    )
    expect(md).toContain(
      '| api_v2 (https://preview) | 404 | 1200 | 250 ms | 400 ms |',
    )
    expect(md).toContain(
      '| static (https://staging) | content | 4000 | 200 ms | 300 ms |',
    )
    expect(md).toContain(
      '| static (https://staging) | 404 | 1200 | 200 ms | 300 ms |',
    )
    expect(md).toContain(
      '| Content p95 (#3147) | 900 ms | < 800 ms | **FAIL** |',
    )
    expect(md).toContain('| 404 p95 (#3149) | 400 ms | < 500 ms | pass |')
  })
})
