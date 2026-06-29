import { StatusBanner, Text } from '@govtech-bb/react'

/**
 * Shown on a service page whose form is under maintenance (#1694) — driven by
 * the recipe's `meta.visibility: "maintenance"`, surfaced to landing via
 * `getMaintenanceForms`. The form's "Start now" method is hidden alongside it.
 */
export function MaintenanceNotice() {
  return (
    <StatusBanner variant="service-issue">
      <Text as="p">
        This form is currently being upgraded to serve you better. Please check
        back soon.
      </Text>
    </StatusBanner>
  )
}
