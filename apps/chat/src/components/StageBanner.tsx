import { Link, StatusBanner, Text } from '@govtech-bb/react'

type Stage = 'alpha' | 'beta' | 'migrated'

type Props =
  | { stage: 'alpha' | 'beta'; url?: string; originalSource?: never }
  | { stage: 'migrated'; originalSource?: string; url?: never }

const COPY: Record<Stage, { prefix: string; linkText: string }> = {
  alpha: { prefix: 'This page is in ', linkText: 'Alpha' },
  beta: { prefix: 'This page is in ', linkText: 'Beta' },
  migrated: {
    prefix: 'This page has been migrated from ',
    linkText: 'gov.bb',
  },
}

const DEFAULT_URL: Record<Stage, string | undefined> = {
  alpha: '/what-we-mean-by-alpha',
  beta: '/what-we-mean-by-alpha',
  migrated: undefined,
}

export function StageBanner(props: Props) {
  const { stage } = props
  const { prefix, linkText } = COPY[stage]
  const isMigrated = stage === 'migrated'
  const href = isMigrated
    ? props.originalSource
    : (props.url ?? DEFAULT_URL[stage])

  return (
    <StatusBanner className="px-0" variant={stage}>
      <Text as="p">
        {prefix}
        {href ? (
          <Link
            href={href}
            variant="secondary"
            external={isMigrated}
          >
            {linkText}
          </Link>
        ) : (
          linkText
        )}
        .
      </Text>
    </StatusBanner>
  )
}
