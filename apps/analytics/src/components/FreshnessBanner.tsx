import { Text } from '@govtech-bb/react'

// #1917: make data freshness explicit. This dashboard is queried live on each
// request (with a short server-side cache), so the banner states "live", the
// reporting window, and when the data was fetched.
function fmtWhen(iso: string): string {
  if (!iso) return 'just now'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

export function FreshnessBanner({
  window,
  generatedAt,
}: {
  window: string
  generatedAt: string
}) {
  return (
    <div className="mt-s rounded-lg bg-teal-10 px-s py-xs">
      <Text as="span" size="small-caption" className="text-mid-grey-00">
        <b>Live</b> · {window} · queried {fmtWhen(generatedAt)}
      </Text>
    </div>
  )
}
