import { Heading, Link, Text } from '@govtech-bb/react'
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
    <aside
      className={`flex flex-col items-start gap-xs border-4 border-yellow-100 bg-yellow-40 px-s py-xm${className ? ` ${className}` : ''}`}
    >
      <Heading as="h3">Was this helpful?</Heading>
      <Text as="p">Give us your feedback about this page.</Text>
      <Link href="/feedback" onClick={handleClick} variant="secondary">
        Help us improve alpha.gov.bb
      </Link>
    </aside>
  )
}
