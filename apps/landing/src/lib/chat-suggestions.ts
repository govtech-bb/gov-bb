import { createServerFn } from '@tanstack/react-start'
import { isVisible, PAGES } from '../content/registry'
import type { ContentPage } from '../content/registry'
import { getApiV2Page } from './api-v2-page'
import type { ViewLevel } from './frontmatter'

const CURATED = [
  {
    serviceId: 'get-birth-certificate',
    question: 'How do I get a birth certificate?',
  },
  {
    serviceId: 'apply-financial-assistance',
    question: 'What financial assistance is available?',
  },
  {
    serviceId: 'get-a-primary-school-textbook-grant',
    question: 'How do I get a primary school textbook grant?',
  },
  {
    serviceId: 'post-office-redirection-individual',
    question: 'How do I redirect my personal mail?',
  },
  {
    serviceId: 'get-a-document-notarised',
    question: 'How do I get a document notarised?',
  },
] as const

function pick(show: (page: ContentPage) => boolean): Array<string> {
  return CURATED.filter(({ serviceId }) => {
    const page = PAGES.find(({ slug }) => slug === serviceId)
    return page ? show(page) : false
  })
    .slice(0, 4)
    .map(({ question }) => question)
}

export function publicChatSuggestions(
  overlay: ReadonlyMap<string, ViewLevel>,
): Array<string> {
  return pick((page) => isVisible(page, 'public', overlay))
}

/** The curated questions whose target url is in `served` (api_v2 urls). */
export function servedChatSuggestions(
  served: ReadonlySet<string>,
): Array<string> {
  return pick((page) => served.has(`/${page.url}`))
}

/** The curated questions whose target api_v2 serves the public. A compile
 *  miss counts: api_v2 did serve the page publicly, only landing's compile
 *  failed. Any other miss, an outage included, says nothing about
 *  visibility, so the chip is dropped (fail-closed). */
export async function readServedChatSuggestions(): Promise<Array<string>> {
  const urls = CURATED.flatMap(({ serviceId }) => {
    const page = PAGES.find(({ slug }) => slug === serviceId)
    return page ? [`/${page.url}`] : []
  })
  const results = await Promise.all(
    urls.map((url) => getApiV2Page({ data: url })),
  )
  return servedChatSuggestions(
    new Set(
      urls.filter((_, i) => {
        const result = results[i]
        return result.kind !== 'miss' || result.reason === 'compile'
      }),
    ),
  )
}

/** Server function: {@link readServedChatSuggestions}, one round trip. */
export const getServedChatSuggestions = createServerFn().handler(
  readServedChatSuggestions,
)
