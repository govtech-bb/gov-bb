import MiniSearch from 'minisearch'
import { analyzeContentMarkdown } from '@govtech-bb/govbbmarkd'
import type { SearchOptions, SearchResult } from 'minisearch'
import {
  isDigitalService,
  isSubPage,
  isUrlVisible,
  PAGES,
} from '../content/registry'
import type { ViewLevel } from './frontmatter'
import type { ApiV2SearchDocument } from './api-v2-site'
import { sitePath } from './breadcrumb-trail'

type SearchKind = 'service'

export interface SearchHit {
  id: string
  title: string
  description: string
  href: string
  digital: boolean
  kind: SearchKind
}

interface IndexDoc extends SearchHit {
  body: string
  keywords: string
  /** A registry page, shown per its visibility; api_v2 lists public pages only. */
  gated: boolean
}

const INDEX_FIELDS = ['title', 'keywords', 'description', 'body']
const IDENTITY_FIELDS = ['title', 'keywords', 'description']
const AUTOCOMPLETE_FIELDS = ['title', 'keywords']
const MIN_PREFIX_LENGTH = 3
const MIN_FUZZY_LENGTH = 5
const MIN_SUGGESTION_LENGTH = 3
const MAX_SUGGESTIONS = 5
const TOKEN_SEPARATOR = /[\n\r\p{Z}\p{P}]+/u

// A relaxed result must match exact title/alias terms, not merely description
// or body copy. Keeping these thresholds together makes the no-result policy
// testable and prevents query-specific score cut-offs.
const RELAXED_CONFIDENCE = {
  minimumMatchedTerms: 2,
  minimumQueryCoverage: 0.5,
  minimumTitleOrKeywordTerms: 2,
}

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'barbados',
  'be',
  'by',
  'can',
  'do',
  'find',
  'for',
  'from',
  'get',
  'government',
  'how',
  'i',
  'in',
  'is',
  'looking',
  'me',
  'my',
  'need',
  'of',
  'on',
  'or',
  'please',
  's',
  'service',
  'the',
  'to',
  'want',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'you',
  'your',
])

const TERM_NORMALIZATIONS: Record<string, string> = {
  center: 'centre',
  centers: 'centres',
  color: 'colour',
  colors: 'colours',
  labor: 'labour',
  license: 'licence',
  licensed: 'licence',
  licenses: 'licence',
  licences: 'licence',
  licensing: 'licence',
  notarize: 'notarised',
  notarized: 'notarised',
  organization: 'organisation',
  organizations: 'organisation',
  program: 'programme',
  programs: 'programmes',
  subsidized: 'subsidised',
}

const MATCH_OPTIONS: SearchOptions = {
  combineWith: 'AND',
  fuzzy: (term) => (term.length >= MIN_FUZZY_LENGTH ? 0.2 : false),
  maxFuzzy: 1,
  prefix: (term, index, terms) =>
    term.length >= MIN_PREFIX_LENGTH && index === terms.length - 1,
  weights: { fuzzy: 0.2, prefix: 0.4 },
}

const SEARCH_OPTIONS: SearchOptions = {
  ...MATCH_OPTIONS,
  boost: { title: 8, keywords: 5, description: 2, body: 0.2 },
}

const AUTOCOMPLETE_OPTIONS: SearchOptions = {
  ...MATCH_OPTIONS,
  fields: AUTOCOMPLETE_FIELDS,
  boost: { title: 8, keywords: 5 },
}

const RELAXED_OPTIONS: SearchOptions = {
  fields: IDENTITY_FIELDS,
  boost: { title: 8, keywords: 5, description: 2 },
  combineWith: 'OR',
  fuzzy: false,
  prefix: false,
}

function normalizeTerm(term: string): string {
  const lower = term.toLowerCase()
  return TERM_NORMALIZATIONS[lower] ?? lower
}

function processTerm(term: string): string | null {
  const normalized = normalizeTerm(term)
  return STOPWORDS.has(normalized) ? null : normalized
}

function tokenize(text: string): Array<string> {
  return text.normalize('NFKC').split(TOKEN_SEPARATOR).filter(Boolean)
}

function meaningfulTerms(text: string): Array<string> {
  return tokenize(text)
    .map(processTerm)
    .filter((term): term is string => term !== null)
}

/** Normalize user input exactly as the search index does. */
export function normalizeSearchQuery(query: string): string {
  return [...new Set(meaningfulTerms(query))].join(' ')
}

function normalizeLiteralPrefix(text: string): string {
  return tokenize(text).map(normalizeTerm).join(' ')
}

const NO_EXTRA: readonly ApiV2SearchDocument[] = []

function buildIndex(extra: readonly ApiV2SearchDocument[]): {
  engine: MiniSearch<IndexDoc>
  documents: Map<string, IndexDoc>
} {
  const documents = new Map<string, IndexDoc>()

  for (const page of PAGES) {
    if (isSubPage(page)) continue
    const document: IndexDoc = {
      id: `service:${page.url}`,
      title: page.frontmatter.title,
      description: page.frontmatter.description ?? '',
      body: analyzeContentMarkdown(page.body, { frontmatter: false }).text,
      keywords: page.frontmatter.keywords?.join(' ') ?? '',
      href: `/${page.url}`,
      digital: isDigitalService(page),
      kind: 'service',
      gated: true,
    }
    documents.set(document.id, document)
  }

  // api_v2's public pages, replacing a static copy at the same url.
  for (const page of extra) {
    const href = sitePath(page.url)
    const document: IndexDoc = {
      id: `service:${href.slice(1)}`,
      title: page.title,
      description: page.description ?? '',
      body: page.chunks
        .map((chunk) => [chunk.heading, chunk.body].filter(Boolean).join(' '))
        .join(' '),
      keywords: page.keywords.join(' '),
      href,
      digital: page.digital,
      kind: 'service',
      gated: false,
    }
    documents.set(document.id, document)
  }

  const engine = new MiniSearch<IndexDoc>({
    idField: 'id',
    fields: INDEX_FIELDS,
    tokenize,
    processTerm,
    searchOptions: SEARCH_OPTIONS,
  })
  engine.addAll([...documents.values()])
  return { engine, documents }
}

let index:
  | {
      extra: readonly ApiV2SearchDocument[]
      built: ReturnType<typeof buildIndex>
    }
  | undefined

/** The index, rebuilt only when api_v2's documents change. */
function getIndex(
  extra: readonly ApiV2SearchDocument[],
): ReturnType<typeof buildIndex> {
  if (index?.extra !== extra) index = { extra, built: buildIndex(extra) }
  return index.built
}

function toSearchHit(document: IndexDoc): SearchHit {
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    href: document.href,
    digital: document.digital,
    kind: document.kind,
  }
}

function matchedTermCount(
  result: SearchResult,
  fields: ReadonlyArray<string>,
): number {
  return Object.values(result.match).filter((matchedFields) =>
    fields.some((field) => matchedFields.includes(field)),
  ).length
}

function identityTier(result: SearchResult): number {
  const matchesAllTermsIn = (field: string) =>
    matchedTermCount(result, [field]) >= result.queryTerms.length

  if (matchesAllTermsIn('title')) return 3
  if (matchesAllTermsIn('keywords')) return 2
  if (matchesAllTermsIn('description')) return 1
  return 0
}

function rankingTier(
  result: SearchResult,
  document: IndexDoc | undefined,
  queryTerms: ReadonlyArray<string>,
): number {
  const title = document ? meaningfulTerms(document.title).join(' ') : ''
  const query = queryTerms.join(' ')

  if (title === query) return 5
  if (` ${title} `.includes(` ${query} `)) return 4
  return identityTier(result)
}

function rankResults(
  results: Array<SearchResult>,
  documents: ReadonlyMap<string, IndexDoc>,
  queryTerms: ReadonlyArray<string>,
): Array<SearchResult> {
  return results.sort((left, right) => {
    const leftDocument = documents.get(String(left.id))
    const rightDocument = documents.get(String(right.id))
    return (
      rankingTier(right, rightDocument, queryTerms) -
        rankingTier(left, leftDocument, queryTerms) ||
      right.score - left.score ||
      (leftDocument?.title ?? '').localeCompare(rightDocument?.title ?? '')
    )
  })
}

function isStrongStrictResult(result: SearchResult): boolean {
  return (
    result.queryTerms.length > 1 ||
    matchedTermCount(result, AUTOCOMPLETE_FIELDS) > 0
  )
}

function isStrongRelaxedResult(
  result: SearchResult,
  queryTermCount: number,
): boolean {
  const matchedTerms = result.queryTerms.length
  return (
    matchedTerms >= RELAXED_CONFIDENCE.minimumMatchedTerms &&
    matchedTerms / queryTermCount >= RELAXED_CONFIDENCE.minimumQueryCoverage &&
    matchedTermCount(result, AUTOCOMPLETE_FIELDS) >=
      RELAXED_CONFIDENCE.minimumTitleOrKeywordTerms
  )
}

function visibleHits(
  results: ReadonlyArray<SearchResult>,
  documents: ReadonlyMap<string, IndexDoc>,
  viewer: ViewLevel,
  overlay?: ReadonlyMap<string, ViewLevel>,
): Array<SearchHit> {
  return results.flatMap((result) => {
    const document = documents.get(String(result.id))
    if (
      !document ||
      (document.gated && !isUrlVisible(document.href.slice(1), viewer, overlay))
    ) {
      return []
    }
    return [toSearchHit(document)]
  })
}

export function search(
  query: string,
  viewer: ViewLevel = 'public',
  overlay?: ReadonlyMap<string, ViewLevel>,
  extra: readonly ApiV2SearchDocument[] = NO_EXTRA,
): Array<SearchHit> {
  const normalized = normalizeSearchQuery(query)
  if (!normalized) return []

  const { engine, documents } = getIndex(extra)
  const queryTerms = normalized.split(' ')
  const strictIdentityResults = engine
    .search(normalized, { fields: IDENTITY_FIELDS })
    .filter(isStrongStrictResult)

  if (strictIdentityResults.length > 0) {
    const identityMatches = new Set(
      strictIdentityResults.map((result) => String(result.id)),
    )
    return visibleHits(
      rankResults(
        engine
          .search(normalized)
          .filter((result) => identityMatches.has(String(result.id))),
        documents,
        queryTerms,
      ),
      documents,
      viewer,
      overlay,
    )
  }

  const relaxedResults = engine
    .search(normalized, RELAXED_OPTIONS)
    .filter((result) => isStrongRelaxedResult(result, queryTerms.length))

  return visibleHits(
    rankResults(relaxedResults, documents, queryTerms),
    documents,
    viewer,
    overlay,
  )
}

export function suggest(
  query: string,
  viewer: ViewLevel = 'public',
  overlay?: ReadonlyMap<string, ViewLevel>,
  extra: readonly ApiV2SearchDocument[] = NO_EXTRA,
): Array<SearchHit> {
  const trimmed = query.trim()
  if (trimmed.length < MIN_SUGGESTION_LENGTH) return []

  const { engine, documents } = getIndex(extra)
  const normalizedPrefix = normalizeLiteralPrefix(trimmed)
  const normalizedQuery = normalizeSearchQuery(trimmed)
  const titlePrefixDocuments = [...documents.values()]
    .filter((document) =>
      normalizeLiteralPrefix(document.title).startsWith(normalizedPrefix),
    )
    .sort((left, right) => left.title.localeCompare(right.title))
  const searchDocuments = normalizedQuery
    ? rankResults(
        engine.search(normalizedQuery, AUTOCOMPLETE_OPTIONS),
        documents,
        normalizedQuery.split(' '),
      ).flatMap((result) => documents.get(String(result.id)) ?? [])
    : []

  const suggestions: Array<SearchHit> = []
  const seen = new Set<string>()
  for (const document of [...titlePrefixDocuments, ...searchDocuments]) {
    if (
      seen.has(document.id) ||
      (document.gated && !isUrlVisible(document.href.slice(1), viewer, overlay))
    ) {
      continue
    }
    seen.add(document.id)
    suggestions.push(toSearchHit(document))
    if (suggestions.length === MAX_SUGGESTIONS) break
  }
  return suggestions
}
