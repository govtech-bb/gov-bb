import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/government/organisations')({
  component: () => <Outlet />,
})
