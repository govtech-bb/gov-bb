import { describe, expect, it } from 'vitest'
import {
  evaluateSearchRelevance,
  SEARCH_RELEVANCE_CASES,
} from './search-relevance'
import { search } from './search'

const report = evaluateSearchRelevance(SEARCH_RELEVANCE_CASES, search)

describe('search relevance dataset', () => {
  for (const outcome of report.outcomes) {
    it(`${outcome.testCase.kind}: ${outcome.testCase.name}`, () => {
      if (outcome.testCase.kind === 'negative') {
        expect(outcome.hrefs).toEqual([])
        return
      }

      expect(
        outcome.expectedRank,
        `${outcome.testCase.query}\n${outcome.hrefs.join('\n')}`,
      ).toBeLessThanOrEqual(outcome.testCase.expectedWithin)
    })
  }

  it('meets the search quality gates', () => {
    console.table(report.metrics)

    expect(report.metrics.expectedAtRank1).toBeGreaterThanOrEqual(85)
    expect(report.metrics.expectedInTop3).toBe(100)
    expect(report.metrics.expectedInTop5).toBe(100)
    expect(report.metrics.negativeQuerySuccessRate).toBe(100)
    expect(report.metrics.incorrectResultRate).toBe(0)
  })
})
