import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
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
    serviceId: 'post-office-redirection-individual',
    question: 'How do I redirect my personal mail?',
  },
  {
    serviceId: 'get-a-primary-school-textbook-grant',
    question: 'How do I get a primary school textbook grant?',
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
    .slice(0, 3)
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

/** The urls of the services in `serviceIds` that api_v2 serves the viewer:
 *  the public, or a reviewer with the preview grant, who also gets preview
 *  pages (#2961). A compile miss counts: api_v2 did serve the page, only
 *  landing's compile failed. Any other miss, an outage included, says nothing
 *  about visibility, so the service is left out (fail-closed). */
async function servedUrls(serviceIds: readonly string[]): Promise<Set<string>> {
  const urls = serviceIds.flatMap((serviceId) => {
    const page = PAGES.find(({ slug }) => slug === serviceId)
    return page ? [`/${page.url}`] : []
  })
  const results = await Promise.all(
    urls.map((url) => getApiV2Page({ data: url })),
  )
  return new Set(
    urls.filter((_, i) => {
      const result = results[i]
      return result.kind !== 'miss' || result.reason === 'compile'
    }),
  )
}

/** The curated questions whose target api_v2 serves the viewer (see
 *  {@link servedUrls}). */
export async function readServedChatSuggestions(): Promise<Array<string>> {
  return servedChatSuggestions(
    await servedUrls(CURATED.map(({ serviceId }) => serviceId)),
  )
}

/** The services in `serviceIds` that api_v2 serves the viewer (see
 *  {@link servedUrls}), for the home page's popular searches. */
export async function readServedServices(
  serviceIds: readonly string[],
): Promise<Array<string>> {
  const served = await servedUrls(serviceIds)
  return serviceIds.filter((serviceId) => {
    const page = PAGES.find(({ slug }) => slug === serviceId)
    return page ? served.has(`/${page.url}`) : false
  })
}

/** Server function: {@link readServedServices}, one round trip. */
export const getServedServices = createServerFn()
  .validator(z.array(z.string()).max(10))
  .handler(({ data }) => readServedServices(data))

/** Server function: {@link readServedChatSuggestions}, one round trip. */
export const getServedChatSuggestions = createServerFn().handler(
  readServedChatSuggestions,
)
