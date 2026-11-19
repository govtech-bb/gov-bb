import { notFound } from '@tanstack/react-router'
import { isUrlVisible, urlLevel } from '../content/registry'
import type { ViewLevel } from './frontmatter'
import { deriveVisibilityOverlay } from './service-status'
import type { ServiceStatusEntry } from './service-status'

/**
 * Gate a static route on its owning content page at `url`: 404 unless the
 * viewer's level meets the page's level, with the runtime service_status
 * overlay applied. Returns that same level so the route's `head` takes its
 * `noindex` from the resolution that decided the 404 (#3255).
 */
export function gateOnContentUrl(
  url: string,
  context: { level: ViewLevel; serviceStatuses: ServiceStatusEntry[] },
): { serviceLevel: ViewLevel } {
  const overlay = deriveVisibilityOverlay(context.serviceStatuses)
  if (!isUrlVisible(url, context.level, overlay)) throw notFound()
  return { serviceLevel: urlLevel(url, overlay) }
}
