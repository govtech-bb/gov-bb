import { Heading, Text } from '@govtech-bb/react'
import { useNavigate } from '@tanstack/react-router'
import { AnalyticsChrome } from './components/AnalyticsChrome'
import { SortHeader, useTableSort } from './components/SortableTable'
import { StatCards } from './components/StatCards'
import type { SearchPayload } from './lib/report'

const fmtInt = (n: number) => n.toLocaleString()
const fmtPct = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}%`

const TH =
  'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'
const CARD = 'overflow-x-auto rounded-lg border border-grey-00'

function QueriesTable({ data }: { data: SearchPayload }) {
  const sort = useTableSort(
    data.queries,
    {
      query: (q) => q.query,
      searches: (q) => q.searches,
      clicks: (q) => q.clicks,
      ctr: (q) => q.ctr,
    },
    'searches',
    'desc',
  )
  return (
    <div className={CARD}>
      <table className="min-w-full">
        <thead>
          <tr>
            <SortHeader label="Query" colKey="query" sort={sort} className={TH} />
            <SortHeader
              label="Searches"
              colKey="searches"
              sort={sort}
              className={`${TH} ${NUM}`}
            />
            <SortHeader
              label="Clicks"
              colKey="clicks"
              sort={sort}
              className={`${TH} ${NUM}`}
            />
            <SortHeader
              label="CTR"
              colKey="ctr"
              sort={sort}
              className={`${TH} ${NUM}`}
            />
          </tr>
        </thead>
        <tbody>
          {sort.sorted.length === 0 ? (
            <tr>
              <td className={`${TD} text-mid-grey-00`} colSpan={4}>
                No searches in this period.
              </td>
            </tr>
          ) : (
            sort.sorted.map((q) => (
              <tr key={q.query} className="hover:bg-teal-10">
                <td className={TD}>
                  {q.query}
                  {q.zeroResult ? (
                    <span className="ms-xs rounded-full bg-teal-10 px-s py-xs text-small-caption text-mid-grey-00">
                      No results
                    </span>
                  ) : null}
                </td>
                <td className={`${TD} ${NUM}`}>{fmtInt(q.searches)}</td>
                <td className={`${TD} ${NUM}`}>{fmtInt(q.clicks)}</td>
                {/* CTR is meaningless for a query that returns nothing to click. */}
                <td className={`${TD} ${NUM}`}>
                  {q.zeroResult ? '—' : fmtPct(q.ctr * 100)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function SearchPage({ data }: { data: SearchPayload }) {
  const navigate = useNavigate()
  return (
    <>
      <AnalyticsChrome
        range={data.range}
        onRangeChange={(range) =>
          navigate({ to: '/analytics/search', search: { range } })
        }
      />
      <div className="container py-8">
        <Heading as="h1" size="h1" className="mb-s">
          Search
        </Heading>
        <Text as="p" size="caption" className="mb-l text-mid-grey-00">
          What people search for on the landing site and whether they click a
          result, for {data.window}.
        </Text>
        {data.configured ? (
          <>
            <StatCards
              cards={[
                {
                  label: 'Searches',
                  value: fmtInt(data.searches),
                  hint: 'Searches that rendered a results page (the `search` event).',
                },
                {
                  label: 'Click-through rate',
                  value: fmtPct(data.ctr * 100),
                  hint: 'Result clicks ÷ searches. A click is any result link followed from the results page.',
                },
                {
                  label: 'Zero-result rate',
                  value: fmtPct(data.zeroResultRate * 100),
                  hint: 'Share of searches that returned no results.',
                },
              ]}
            />
            <Heading as="h2" size="h3" className="mt-l mb-s">
              Top queries
            </Heading>
            <Text as="p" size="caption" className="mb-s text-mid-grey-00">
              Most-searched terms, with per-query click-through. Click any column
              to sort.
            </Text>
            <QueriesTable data={data} />
          </>
        ) : (
          <Text as="p" className="text-mid-grey-00">
            Analytics is not configured.
          </Text>
        )}
      </div>
    </>
  )
}
