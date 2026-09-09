import { createFileRoute } from '@tanstack/react-router'
import { SmartToolPreview } from './-smart-tool-preview'

export const Route = createFileRoute('/preview-smart-tool')({
  head: () => ({
    meta: [
      { title: 'Smart tool preview' },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
  }),
  component: SmartToolPreview,
})
