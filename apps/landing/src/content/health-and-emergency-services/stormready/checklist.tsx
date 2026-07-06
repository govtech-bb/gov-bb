import {
  DESCRIPTION,
  StormReadyChecklistPage,
  TITLE,
} from './-ui/checklist-page'

/**
 * Interactive household checklist — a co-located content page in the StormReady
 * service folder, beside index.md and its -ui/-data. It renders its own title
 * and layout, so the catch-all route renders it bare inside the page shell (see
 * registry `selfRendered`). Visibility is gated by the catch-all like any
 * content page; document head comes from `meta`.
 */
export const meta = {
  title: TITLE,
  description: DESCRIPTION,
  visibility: 'public',
} as const

export default StormReadyChecklistPage
