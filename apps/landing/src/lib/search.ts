import MiniSearch from 'minisearch'
import type { SearchOptions, SearchResult } from 'minisearch'
import {
  isDigitalService,
  isSubPage,
  isUrlVisible,
  PAGES,
} from '../content/registry'
import type { ViewLevel } from './frontmatter'

type SearchKind = 'service'

export interface SearchHit {
  id: string
  title: string
  description: string
  href: string
  digital: boolean
  kind: SearchKind
}

export interface SearchSuggestion {
  value: string
  serviceTitle: string
  href: string
}

interface IndexDoc extends SearchHit {
  body: string
  keywords: string
  searchSuggestions: Array<string>
}

interface SuggestionDoc {
  id: string
  serviceId: string
  value: string
  keywords: string
}

const INDEX_FIELDS = ['title', 'keywords', 'description', 'body']
const IDENTITY_FIELDS = ['title', 'keywords', 'description']
const STRONG_IDENTITY_FIELDS = ['title', 'keywords']
const SUGGESTION_FIELDS = ['value', 'keywords']
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

const SUGGESTION_OPTIONS: SearchOptions = {
  ...MATCH_OPTIONS,
  fields: SUGGESTION_FIELDS,
  boost: { value: 8, keywords: 3 },
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

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildIndex(): {
  engine: MiniSearch<IndexDoc>
  documents: Map<string, IndexDoc>
  suggestionEngine: MiniSearch<SuggestionDoc>
  suggestionDocuments: Map<string, SuggestionDoc>
} {
  const documents = new Map<string, IndexDoc>()

  for (const page of PAGES) {
    if (isSubPage(page)) continue
    const searchSuggestions = page.frontmatter.searchSuggestions ?? []
    const document: IndexDoc = {
      id: `service:${page.url}`,
      title: page.frontmatter.title,
      description: page.frontmatter.description ?? '',
      body: stripMarkdown(page.body),
      keywords: page.frontmatter.keywords?.join(' ') ?? '',
      searchSuggestions,
      href: `/${page.url}`,
      digital: isDigitalService(page),
      kind: 'service',
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

  const suggestionDocuments = new Map<string, SuggestionDoc>()
  for (const document of documents.values()) {
    for (const value of new Set([
      ...document.searchSuggestions,
      document.title,
    ])) {
      const suggestion: SuggestionDoc = {
        id: `suggestion:${suggestionDocuments.size}`,
        serviceId: document.id,
        value,
        keywords: document.keywords,
      }
      suggestionDocuments.set(suggestion.id, suggestion)
    }
  }
  const suggestionEngine = new MiniSearch<SuggestionDoc>({
    idField: 'id',
    fields: SUGGESTION_FIELDS,
    tokenize,
    processTerm,
    searchOptions: SUGGESTION_OPTIONS,
  })
  suggestionEngine.addAll([...suggestionDocuments.values()])

  return { engine, documents, suggestionEngine, suggestionDocuments }
}

let index: ReturnType<typeof buildIndex> | undefined

function getIndex(): ReturnType<typeof buildIndex> {
  return (index ??= buildIndex())
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
    matchedTermCount(result, STRONG_IDENTITY_FIELDS) > 0
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
    matchedTermCount(result, STRONG_IDENTITY_FIELDS) >=
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
    if (!document || !isUrlVisible(document.href.slice(1), viewer, overlay)) {
      return []
    }
    return [toSearchHit(document)]
  })
}

export function search(
  query: string,
  viewer: ViewLevel = 'public',
  overlay?: ReadonlyMap<string, ViewLevel>,
): Array<SearchHit> {
  const normalized = normalizeSearchQuery(query)
  if (!normalized) return []

  const { engine, documents } = getIndex()
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
): Array<SearchSuggestion> {
  const trimmed = query.trim()
  if (trimmed.length < MIN_SUGGESTION_LENGTH) return []

  const { documents, suggestionEngine, suggestionDocuments } = getIndex()
  const normalizedPrefix = normalizeLiteralPrefix(trimmed)
  if (!normalizedPrefix) return []
  const normalizedQuery = normalizeSearchQuery(trimmed)
  const literalPrefixSuggestions = [...suggestionDocuments.values()]
    .filter((suggestion) =>
      normalizeLiteralPrefix(suggestion.value).startsWith(normalizedPrefix),
    )
    .sort(
      (left, right) =>
        left.value.length - right.value.length ||
        left.value.localeCompare(right.value),
    )
  const matchedSuggestions = normalizedQuery
    ? suggestionEngine
        .search(normalizedQuery)
        .flatMap((result) => suggestionDocuments.get(String(result.id)) ?? [])
    : []

  const suggestions: Array<SearchSuggestion> = []
  const seen = new Set<string>()
  for (const suggestion of [
    ...literalPrefixSuggestions,
    ...matchedSuggestions,
  ]) {
    const document = documents.get(suggestion.serviceId)
    const key = normalizeLiteralPrefix(suggestion.value)
    if (
      !document ||
      seen.has(key) ||
      !isUrlVisible(document.href.slice(1), viewer, overlay)
    ) {
      continue
    }
    seen.add(key)
    suggestions.push({
      value: suggestion.value,
      serviceTitle: document.title,
      href: document.href,
    })
    if (suggestions.length === MAX_SUGGESTIONS) break
  }
  return suggestions
}
