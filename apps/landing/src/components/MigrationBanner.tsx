import { Link, StatusBanner, Text } from '@govtech-bb/react'

type MigrationBannerProps = {
  pageURL?: string
  url?: string
}

export function MigrationBanner({
  pageURL,
  url = 'https://www.gov.bb',
}: MigrationBannerProps) {
  return (
    <StatusBanner variant="migrated">
      <Text as="p">
        This {pageURL ? 'page' : 'content'} was originally published on{' '}
        <Link
          className="underline"
          href={url}
          rel="noopener noreferrer"
          target="_blank"
          variant="secondary"
        >
          gov.bb
        </Link>
        . It may be out of date or shown differently here.
      </Text>
      {pageURL ? (
        <Link
          href={pageURL}
          rel="noopener noreferrer"
          target="_blank"
          variant="secondary"
        >
          View the original source
        </Link>
      ) : null}
    </StatusBanner>
  )
}
