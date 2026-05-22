import MiniSearch from 'minisearch'
import { PAGES } from '../content/registry'
import { CATEGORY_BY_SLUG } from '../content/categories'
import {
  BODY_BY_SLUG,
  DEPARTMENTS,
  MINISTRIES,
  ORG_CATEGORY_LABEL,
  STATE_BODIES,
} from '../content/mda'
import type { Department, Ministry, StateBody } from '../content/mda'
import { orgHref } from '../content/orgs'

export type SearchKind = 'service' | 'ministry' | 'department' | 'state-body'

export interface SearchHit {
  id: string
  title: string
  description: string
  href: string
  category: string
  kind: SearchKind
}

interface IndexDoc extends SearchHit {
  body: string
  keywords: string
}

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'for',
  'to',
  'in',
  'on',
  'at',
  'and',
  'or',
  'is',
  'are',
  'be',
  'as',
  'by',
  'with',
  'from',
  'i',
  'you',
  'my',
  'your',
  'how',
  'do',
  'can',
])

const SYNONYM_GROUPS: Array<{
  triggers: Array<string>
  extras: Array<string>
}> = [
  {
    triggers: ['tax', 'taxes', 'revenue', 'vat'],
    extras: ['tax', 'taxes', 'revenue', 'VAT', 'BRA'],
  },
  {
    triggers: ['licence', 'license', 'driving', 'driver'],
    extras: ['licence', 'license', 'driving', 'driver', 'permit'],
  },
  {
    triggers: ['health', 'medical', 'hospital', 'clinic'],
    extras: ['health', 'medical', 'hospital', 'clinic', 'doctor'],
  },
  {
    triggers: ['school', 'education', 'student', 'teacher'],
    extras: ['school', 'education', 'student', 'teacher', 'learning'],
  },
  {
    triggers: ['passport', 'immigration', 'visa'],
    extras: ['passport', 'immigration', 'visa', 'travel document'],
  },
  {
    triggers: ['identification', 'national id'],
    extras: ['ID', 'identification', 'national ID'],
  },
  {
    triggers: ['police', 'constabulary', 'crime'],
    extras: ['police', 'constabulary', 'crime', 'RBPF'],
  },
  {
    triggers: ['pension', 'retirement', 'nis'],
    extras: ['pension', 'retirement', 'NIS', 'national insurance'],
  },
  {
    triggers: ['business', 'company', 'incorporation', 'registry'],
    extras: ['business', 'company', 'incorporation', 'registry'],
  },
  {
    triggers: ['birth', 'death', 'marriage', 'certificate'],
    extras: ['birth', 'death', 'marriage', 'certificate', 'civil registration'],
  },
  {
    triggers: ['job', 'employment', 'labour', 'labor'],
    extras: ['job', 'employment', 'work', 'labour', 'vacancy'],
  },
  {
    triggers: ['water', 'wastewater', 'sewerage'],
    extras: ['water', 'wastewater', 'sewerage', 'BWA'],
  },
  {
    triggers: ['electricity', 'power', 'energy'],
    extras: ['electricity', 'power', 'energy', 'BL&P'],
  },
  {
    triggers: ['transport', 'bus', 'transit'],
    extras: ['transport', 'bus', 'transit', 'BTB'],
  },
]

const ACRONYM_STOPWORDS = new Set([
  'of',
  'and',
  'the',
  'for',
  'to',
  'in',
  'on',
  '&',
  'a',
  'an',
])

function synonymsFor(text: string): Array<string> {
  const lower = text.toLowerCase()
  const out = new Set<string>()
  for (const { triggers, extras } of SYNONYM_GROUPS) {
    const hit = triggers.some((t) =>
      new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
        lower,
      ),
    )
    if (hit) for (const e of extras) out.add(e)
  }
  return [...out]
}

function significantWords(name: string): Array<string> {
  return name
    .replace(/['’`]s\b/gi, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !ACRONYM_STOPWORDS.has(w.toLowerCase()))
}

function acronymsFor(name: string): Array<string> {
  const words = significantWords(name)
  if (words.length < 2) return []
  const letters = words.map((w) => w[0]?.toUpperCase() ?? '')
  const out = new Set<string>()
  out.add(letters.join(''))
  if (letters.length > 3) out.add(letters.slice(0, 3).join(''))
  return [...out]
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildKeywords(
  title: string,
  description: string,
  extra: ReadonlyArray<string> = [],
): string {
  return [
    ...extra,
    ...acronymsFor(title),
    ...synonymsFor(`${title} ${description}`),
  ].join(' ')
}

function mdaDoc(entry: Ministry | Department | StateBody): IndexDoc {
  const { kind, slug, name, keywords = [] } = entry
  const description =
    typeof entry.intro === 'string'
      ? (entry.shortDescription ?? entry.intro)
      : (entry.shortDescription ?? '')
  return {
    id: `${kind}:${slug}`,
    title: name,
    description,
    body: stripMarkdown(BODY_BY_SLUG.get(slug) ?? ''),
    keywords: buildKeywords(name, description, keywords),
    href: orgHref(slug),
    category: ORG_CATEGORY_LABEL[kind],
    kind,
  }
}

function buildIndex(): {
  ms: MiniSearch<IndexDoc>
  docs: Map<string, IndexDoc>
} {
  const docs = new Map<string, IndexDoc>()

  for (const page of PAGES) {
    const firstCat = page.frontmatter.categories[0]
    const category =
      (firstCat && CATEGORY_BY_SLUG[firstCat]?.title) || 'Service'
    const title = page.frontmatter.title
    const description = page.frontmatter.description ?? ''
    const doc: IndexDoc = {
      id: `service:${page.url}`,
      title,
      description,
      body: stripMarkdown(page.body),
      keywords: buildKeywords(title, description),
      href: `/${page.url}`,
      category,
      kind: 'service',
    }
    docs.set(doc.id, doc)
  }

  for (const entry of [...MINISTRIES, ...DEPARTMENTS, ...STATE_BODIES]) {
    const doc = mdaDoc(entry)
    docs.set(doc.id, doc)
  }

  const ms = new MiniSearch<IndexDoc>({
    idField: 'id',
    fields: ['title', 'keywords', 'description', 'body'],
    storeFields: ['title', 'description', 'href', 'category', 'kind'],
    processTerm: (term) => {
      const lower = term.toLowerCase()
      return STOPWORDS.has(lower) ? null : lower
    },
    searchOptions: {
      boost: { keywords: 5, title: 4, description: 1.5, body: 0.3 },
      fuzzy: (term) => (term.length > 3 ? 0.3 : 0),
      prefix: (term) => term.length >= 1,
      combineWith: 'AND',
      weights: { fuzzy: 0.3, prefix: 0.3 },
    },
  })
  ms.addAll([...docs.values()])
  return { ms, docs }
}

const indexPromise: { current: ReturnType<typeof buildIndex> | null } = {
  current: null,
}

function getIndex() {
  if (!indexPromise.current) indexPromise.current = buildIndex()
  return indexPromise.current
}

export function search(query: string): Array<SearchHit> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const { ms, docs } = getIndex()
  return ms.search(trimmed).map((r): SearchHit => {
    const stored = docs.get(String(r.id))
    return {
      id: String(r.id),
      title: (r.title as string) ?? stored?.title ?? '',
      description: (r.description as string) ?? stored?.description ?? '',
      href: (r.href as string) ?? stored?.href ?? '',
      category: (r.category as string) ?? stored?.category ?? '',
      kind: (r.kind as SearchKind) ?? stored?.kind ?? 'service',
    }
  })
}
