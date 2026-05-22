import { Heading, LinkButton, Text } from '@govtech-bb/react'

interface ErrorPageAction {
  label: string
  href: string
}

interface ErrorPageProps {
  title: string
  intro: React.ReactNode
  suggestions: React.ReactNode[]
  secondary?: ErrorPageAction
  primary?: ErrorPageAction
}

export function ErrorPage({
  title,
  intro,
  suggestions,
  secondary,
  primary,
}: ErrorPageProps) {
  return (
    <div className="container py-8 lg:py-16">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2 lg:space-y-8">
        <Heading as="h1">{title}</Heading>
        <Text as="p">{intro}</Text>
        <div className="space-y-4">
          <Heading as="h3">Suggestions:</Heading>
          <ul className="list-disc space-y-2 ps-8">
            {suggestions.map((s, i) => (
              <li key={i}>
                <Text as="span">{s}</Text>
              </li>
            ))}
          </ul>
        </div>
        {(secondary || primary) && (
          <div className="flex flex-wrap gap-4 pt-2">
            {secondary && (
              <LinkButton href={secondary.href} variant="secondary">
                {secondary.label}
              </LinkButton>
            )}
            {primary && (
              <LinkButton href={primary.href} variant="primary">
                {primary.label}
              </LinkButton>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
