import { StatusBanner, Text } from '@govtech-bb/react'

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
