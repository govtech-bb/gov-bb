import { createFileRoute } from '@tanstack/react-router'
import { AssistantView } from '../components/AssistantView'
import { pageHead } from '../lib/page-head'

export const Route = createFileRoute('/assistant')({
  head: () =>
    pageHead(
      'Ask the assistant',
      "Tell us what you need to do in your own words and we'll walk you through it.",
      { path: '/assistant' },
    ),
  component: AssistantView,
})
