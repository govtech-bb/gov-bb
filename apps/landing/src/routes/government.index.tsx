import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/government/')({
  beforeLoad: () => {
    throw redirect({ to: '/government/organisations' })
  },
})
