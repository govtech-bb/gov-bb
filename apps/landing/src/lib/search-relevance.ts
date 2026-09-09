import type { ViewLevel } from './frontmatter'

type ExpectedRank = 1 | 3 | 5

export type SearchRelevanceCase =
  | {
      kind: 'positive' | 'ranking'
      name: string
      query: string
      expectedHref: string
      expectedWithin: ExpectedRank
      viewer?: ViewLevel
    }
  | {
      kind: 'negative'
      name: string
      query: string
      viewer?: ViewLevel
    }

/**
 * Production-content queries from known regressions and representative citizen
 * wording. Add confirmed search feedback here so it becomes a permanent gate.
 */
export const SEARCH_RELEVANCE_CASES: ReadonlyArray<SearchRelevanceCase> = [
  // Positive: exact names, alternative wording, citizen terms and acronyms.
  {
    kind: 'positive',
    name: 'exact service wording',
    query: 'death certificate',
    expectedHref: '/family-birth-relationships/get-death-certificate',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'alternative wording',
    query: 'redundancy pay',
    expectedHref: '/money-financial-support/calculate-severance-pay',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'citizen terminology',
    query: 'days off',
    expectedHref: '/bank-holiday-calendar',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'local pharmacy terminology',
    query: 'open chemist',
    viewer: 'preview',
    expectedHref: '/health-and-emergency-services/find-an-open-pharmacy',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'service abbreviation',
    query: 'BDS',
    viewer: 'preview',
    expectedHref: '/health-and-emergency-services/find-an-open-pharmacy',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'National Insurance abbreviation',
    query: 'NIS self employed',
    viewer: 'preview',
    expectedHref:
      '/money-financial-support/national-insurance-for-self-employed-workers',
    expectedWithin: 1,
  },

  // Positive: spelling variants, typos, partial words and reordered terms.
  {
    kind: 'positive',
    name: 'American licence spelling',
    query: 'food business license',
    viewer: 'preview',
    expectedHref: '/business-trade/apply-for-food-business-licence',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'American colour spelling',
    query: 'prescription color',
    viewer: 'preview',
    expectedHref: '/health-and-emergency-services/prescription-colours',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'certificate typo',
    query: 'birth certficate',
    expectedHref: '/family-birth-relationships/get-birth-certificate',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'licence typo',
    query: 'food business licnce',
    viewer: 'preview',
    expectedHref: '/business-trade/apply-for-food-business-licence',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'partial final word',
    query: 'birth certif',
    expectedHref: '/family-birth-relationships/get-birth-certificate',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'partial notarised word',
    query: 'document notar',
    expectedHref: '/travel-id-citizenship/get-a-document-notarised',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'reordered terms',
    query: 'certificate birth',
    expectedHref: '/family-birth-relationships/get-birth-certificate',
    expectedWithin: 1,
  },

  // Positive: natural language, punctuation and controlled relaxation.
  {
    kind: 'positive',
    name: 'question scaffolding',
    query: 'where can I get a birth certificate',
    expectedHref: '/family-birth-relationships/get-birth-certificate',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'relaxed replacement wording',
    query: 'I lost my death certificate and need another copy',
    expectedHref: '/family-birth-relationships/get-death-certificate',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'relaxed event wording',
    query: 'book a community centre for a party',
    viewer: 'preview',
    expectedHref:
      '/youth-and-community/children-families-community/centre-access',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'case punctuation and whitespace',
    query: '  GET—A   MARRIAGE CERTIFICATE!!!  ',
    expectedHref: '/family-birth-relationships/get-marriage-certificate',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'apostrophe handling',
    query: "conductor's license",
    expectedHref: '/work-employment/apply-for-conductor-licence',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'American notarise wording',
    query: 'notarize my document',
    expectedHref: '/travel-id-citizenship/get-a-document-notarised',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'American programme spelling',
    query: 'home care program',
    viewer: 'preview',
    expectedHref: '/social-empowerment/apply-for-home-care-programme',
    expectedWithin: 1,
  },

  // Positive: anonymized aggregate Umami queries with clear service intent.
  {
    kind: 'positive',
    name: 'observed birth certificate typo',
    query: 'How do I apply for a birth cirtificate',
    expectedHref: '/family-birth-relationships/get-birth-certificate',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'observed textbook grant wording',
    query: 'Textbook grant',
    expectedHref:
      '/money-financial-support/get-a-primary-school-textbook-grant',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'observed split textbook spelling',
    query: 'Text book grant',
    expectedHref:
      '/money-financial-support/get-a-primary-school-textbook-grant',
    expectedWithin: 1,
  },
  {
    kind: 'ranking',
    name: 'observed housing abbreviation',
    query: 'nhc',
    viewer: 'preview',
    expectedHref: '/housing/apply-to-buy-nhc-land-or-property',
    expectedWithin: 3,
  },
  {
    kind: 'positive',
    name: 'observed Crop Over wording',
    query: 'crop over',
    expectedHref: '/business-trade/crop-over-permits',
    expectedWithin: 1,
  },
  {
    kind: 'positive',
    name: 'observed state land wording',
    query: 'state land',
    viewer: 'preview',
    expectedHref: '/housing/apply-to-use-state-land',
    expectedWithin: 1,
  },

  // Ranking: several services are relevant, but the named service must stay near the top.
  {
    kind: 'ranking',
    name: 'birth services',
    query: 'birth',
    expectedHref: '/family-birth-relationships/register-a-birth',
    expectedWithin: 3,
  },
  {
    kind: 'ranking',
    name: 'summer camp services',
    query: 'summer camp',
    expectedHref: '/work-employment/register-summer-camp',
    expectedWithin: 3,
  },
  {
    kind: 'ranking',
    name: 'prescription services',
    query: 'prescription medication',
    viewer: 'preview',
    expectedHref: '/health-and-emergency-services/find-an-open-pharmacy',
    expectedWithin: 3,
  },
  {
    kind: 'ranking',
    name: 'mail redirection services',
    query: 'mail redirection',
    expectedHref: '/travel-id-citizenship/post-office-redirection-individual',
    expectedWithin: 3,
  },

  // Negative: Alpha does not provide these services, or the only match is incidental copy.
  { kind: 'negative', name: 'missing passport service', query: 'passport' },
  {
    kind: 'negative',
    name: 'passport renewal regression',
    query: 'renew passport',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'reordered missing passport service',
    query: 'passport renewal',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'missing driving licence renewal',
    query: 'renew driving licence',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'missing doctor appointment service',
    query: 'book doctor appointment',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'missing road tax service',
    query: 'pay road tax',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'description-only acronym',
    query: 'BRA',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'body-only pharmacy wording',
    query: 'photocopies',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'missing unemployment benefit',
    query: 'unemployment benefit',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'unrelated licence protected from OR matching',
    query: 'fishing licence',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'only question scaffolding',
    query: 'where can I',
    viewer: 'preview',
  },

  // Negative: aggregate Umami queries for services Alpha does not contain.
  {
    kind: 'negative',
    name: 'observed missing police certificate of character',
    query: 'Police certificate of character',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'observed missing certificate of character',
    query: 'certificate of character',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'observed missing police certificate',
    query: 'Police certificate',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'observed missing sewerage tax service',
    query: 'sewerage tax',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'observed missing EZpay registration',
    query: 'Ez pay sign up',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'observed missing revenue authority service',
    query: 'Arbados revenue authority',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'observed missing licensing authority service',
    query: 'Licensing authority',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'observed missing security guard service',
    query: 'Security guard',
    viewer: 'preview',
  },
  {
    kind: 'negative',
    name: 'observed missing procurement service',
    query: 'procurement',
    viewer: 'preview',
  },
]

export interface SearchQualityMetrics {
  queryCount: number
  expectedAtRank1: number
  expectedInTop3: number
  expectedInTop5: number
  negativeQuerySuccessRate: number
  zeroResultRate: number
  incorrectResultRate: number
}

export interface SearchRelevanceOutcome {
  testCase: SearchRelevanceCase
  hrefs: Array<string>
  expectedRank?: number
  correct: boolean
}

function percentage(count: number, total: number): number {
  return total === 0 ? 100 : Math.round((count / total) * 1000) / 10
}

export function evaluateSearchRelevance(
  cases: ReadonlyArray<SearchRelevanceCase>,
  find: (query: string, viewer?: ViewLevel) => ReadonlyArray<{ href: string }>,
): {
  metrics: SearchQualityMetrics
  outcomes: Array<SearchRelevanceOutcome>
} {
  const outcomes = cases.map((testCase): SearchRelevanceOutcome => {
    const hrefs = find(testCase.query, testCase.viewer).map((hit) => hit.href)
    if (testCase.kind === 'negative') {
      return { testCase, hrefs, correct: hrefs.length === 0 }
    }

    const index = hrefs.indexOf(testCase.expectedHref)
    const expectedRank = index === -1 ? undefined : index + 1
    return {
      testCase,
      hrefs,
      expectedRank,
      correct:
        expectedRank !== undefined && expectedRank <= testCase.expectedWithin,
    }
  })
  const expected = outcomes.filter(
    (outcome) => outcome.testCase.kind !== 'negative',
  )
  const negative = outcomes.filter(
    (outcome) => outcome.testCase.kind === 'negative',
  )

  return {
    metrics: {
      queryCount: outcomes.length,
      expectedAtRank1: percentage(
        expected.filter((outcome) => outcome.expectedRank === 1).length,
        expected.length,
      ),
      expectedInTop3: percentage(
        expected.filter(
          (outcome) =>
            outcome.expectedRank !== undefined && outcome.expectedRank <= 3,
        ).length,
        expected.length,
      ),
      expectedInTop5: percentage(
        expected.filter(
          (outcome) =>
            outcome.expectedRank !== undefined && outcome.expectedRank <= 5,
        ).length,
        expected.length,
      ),
      negativeQuerySuccessRate: percentage(
        negative.filter((outcome) => outcome.hrefs.length === 0).length,
        negative.length,
      ),
      zeroResultRate: percentage(
        outcomes.filter((outcome) => outcome.hrefs.length === 0).length,
        outcomes.length,
      ),
      incorrectResultRate: percentage(
        outcomes.filter((outcome) => !outcome.correct).length,
        outcomes.length,
      ),
    },
    outcomes,
  }
}
