import { isVisible, PAGES } from '../content/registry'
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

export function publicChatSuggestions(
  overlay: ReadonlyMap<string, ViewLevel>,
): Array<string> {
  return CURATED.filter(({ serviceId }) => {
    const page = PAGES.find(({ slug }) => slug === serviceId)
    return page ? isVisible(page, 'public', overlay) : false
  })
    .slice(0, 4)
    .map(({ question }) => question)
}
