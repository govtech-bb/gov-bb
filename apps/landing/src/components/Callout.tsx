import type { ReactNode } from 'react'

const VARIANTS = {
  information: 'border-blue-100 bg-blue-10',
  warning: 'border-yellow-100 bg-yellow-10',
} as const

type Variant = keyof typeof VARIANTS

/**
 * Notice box authored as `<callout variant="warning">…</callout>` in a page
 * body. The design system has no generic callout (StatusBanner is for service
 * status only), so this is a landing-local component.
 */
export function Callout({
  variant,
  children,
}: {
  variant?: string
  children: ReactNode
}) {
  const cls = VARIANTS[(variant as Variant) in VARIANTS ? (variant as Variant) : 'information']
  return (
    <div className={`my-s space-y-2 border-l-4 px-4 py-3 ${cls}`}>{children}</div>
  )
}
