import { Text } from '@govtech-bb/react'
import { useRouterState } from '@tanstack/react-router'

// A gray transparent full-page overlay shown while a navigation (e.g. a
// date-range change) runs its loader, so it's clear the whole page is being
// refreshed. Blocks interaction until the new data arrives.
export function LoadingOverlay() {
  const isLoading = useRouterState({ select: (s) => s.isLoading })
  if (!isLoading) return null
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Refreshing data"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black-00/20"
    >
      <style>{SPIN_CSS}</style>
      <span className="flex items-center gap-s rounded-lg bg-white-00 px-m py-s shadow-xl">
        <span
          aria-hidden="true"
          className="uar-spin inline-block h-[16px] w-[16px] rounded-full border-2 border-grey-00 border-t-teal-00"
        />
        <Text as="span" size="caption" weight="bold">
          Updating…
        </Text>
      </span>
    </div>
  )
}

const SPIN_CSS = `
.uar-spin { animation: uar-spin .7s linear infinite; }
@keyframes uar-spin { to { transform: rotate(360deg); } }
`
