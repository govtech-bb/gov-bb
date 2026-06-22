import { useEffect } from 'react'

/**
 * Mounts the in-page commenting widget on the client, but only for reviewers in
 * preview mode (gated by the caller). Renders nothing itself — the widget
 * injects its own floating UI and right-hand sidebar.
 *
 * The widget package is dynamically imported inside the effect so its code is
 * code-split into its own chunk and never downloaded by ordinary visitors: the
 * effect runs only in the browser, and only when `enabled` is true.
 */
export function PreviewComments({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return

    let teardown: (() => void) | undefined
    let cancelled = false

    void import('@govtech-bb/preview-comments').then(
      ({ mountPreviewComments }) => {
        if (cancelled) return
        teardown = mountPreviewComments({ root: '#main' })
      },
    )

    return () => {
      cancelled = true
      teardown?.()
    }
  }, [enabled])

  return null
}
