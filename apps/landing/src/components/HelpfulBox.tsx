import { Feedback, Link, Text } from '@govtech-bb/react'
import { useRouterState } from '@tanstack/react-router'

interface HelpfulBoxProps {
  className?: string
}

export function HelpfulBox({ className }: HelpfulBoxProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const handleClick = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('feedbackReferrer', pathname)
    }
  }

  return (
    <Feedback className={className} heading="Was this helpful?">
      <Text as="p">Give us your feedback about this page.</Text>
      <Link
        href="/feedback"
        onClick={handleClick}
        data-umami-event="helpful-feedback"
        data-umami-event-path={pathname}
      >
        Help us improve alpha.gov.bb
      </Link>
    </Feedback>
  )
}
