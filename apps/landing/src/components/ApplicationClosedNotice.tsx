import { StatusBanner, Text } from '@govtech-bb/react'

/**
 * Shown on a service page whose form's application window has closed (#1936).
 * The form's "Start now" method is hidden alongside it. The full dated
 * "Applications have closed" page lives in apps/forms.
 */
export function ApplicationClosedNotice() {
  return (
    <StatusBanner variant="service-issue" className="mb-4">
      <Text as="p">Applications for this service have closed.</Text>
    </StatusBanner>
  )
}
