import { createFileRoute } from '@tanstack/react-router'
import { Heading, Select, Text } from '@govtech-bb/react'
import * as React from 'react'
import { PAGES } from '../content/registry'
import { REPORT } from '../lib/umami-analytics'
import type { FormDetail, FormRow, SearchReport } from '../lib/umami-analytics'

const DEFAULT_PRESET = 'last-30-days'

export const Route = createFileRoute('/analytics')({
  head: () => ({
    meta: [
      { title: 'Analytics | Government of Barbados' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AnalyticsPage,
})

// form_id -> { title, category } from landing's own content registry, used to
// label the form rows (the build-time snapshot only knows form ids).
const FORM_META = new Map<string, { title: string; category: string }>()
for (const page of PAGES) {
  const id = page.frontmatter.form_id
  if (!id || FORM_META.has(id)) continue
  FORM_META.set(id, {
    title: page.frontmatter.title,
    category: page.frontmatter.categories[0] ?? 'uncategorised',
  })
}

function enrich(forms: FormRow[]): FormRow[] {
  return forms.map((f) => {
    const meta = FORM_META.get(f.formId)
    return meta ? { ...f, title: meta.title, category: meta.category } : f
  })
}

// --- formatting helpers ---
const fmtInt = (n: number) => n.toLocaleString()
const fmtPct = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}%`
const fmtDur = (s: number | null) =>
  s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`

function fmtUpdated(iso: string, tz: string): string {
  if (!iso) return 'not yet generated'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
    timeZoneName: 'short',
  }).format(new Date(iso))
}

const REASONS: Record<string, string> = {
  required: 'Required field left blank',
  invalid_format: 'Invalid format (e.g. email, date, number)',
  invalid_type: 'Wrong type of value',
  invalid_string: 'Invalid text',
  invalid_enum_value: 'Not one of the allowed options',
  too_small: 'Too short / below the minimum',
  too_big: 'Too long / above the maximum',
  not_multiple_of: 'Not an allowed increment',
  pattern: "Doesn't match the required pattern",
  custom: 'Failed a custom validation rule',
}
const reasonLabel = (code: string) => REASONS[code] ?? code

// --- shared class fragments (design-system tokens) ---
const TH =
  'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'
const CARD = 'overflow-x-auto rounded-lg border border-grey-00'

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text
      as="span"
      size="caption"
      weight="bold"
      className="mt-m mb-xs block uppercase tracking-wide text-mid-grey-00"
    >
      {children}
    </Text>
  )
}

function HowToButton({ target }: { target: string }) {
  return (
    <button
      type="button"
      popoverTarget={target}
      className="rounded-full border border-grey-00 px-s py-xs text-caption font-bold text-teal-00"
    >
      How it works
    </button>
  )
}

interface SrcPop {
  sources: { referrer: string; count: number }[]
  x: number
  y: number
}

function AnalyticsPage() {
  const { presets, generatedAt, timezone } = REPORT
  const [presetKey, setPresetKey] = React.useState(
    presets.find((p) => p.key === DEFAULT_PRESET)?.key ?? presets[0]?.key ?? '',
  )
  const [activeForm, setActiveForm] = React.useState<string | null>(null)
  const [srcPop, setSrcPop] = React.useState<SrcPop | null>(null)

  const current = presets.find((p) => p.key === presetKey) ?? presets[0] ?? null

  if (!current) {
    return (
      <div className="container py-8">
        <Heading as="h1" size="h1">
          Umami Analytics
        </Heading>
        <Text as="p" className="mt-s text-mid-grey-00">
          The analytics snapshot has not been generated yet. It is produced at
          build time and refreshed on a schedule — check back after the next
          deploy.
        </Text>
      </div>
    )
  }

  const forms = enrich(current.forms)
  const activeRow = forms.find((f) => f.formId === activeForm) ?? null
  const activeDetail: FormDetail | null = activeForm
    ? (current.details[activeForm] ?? null)
    : null

  function changePreset(key: string) {
    setActiveForm(null)
    setPresetKey(key)
  }

  function toggleForm(formId: string) {
    setActiveForm((cur) => (cur === formId ? null : formId))
  }

  return (
    <div className="container py-8">
      <style>{POPOVER_CSS}</style>

      <header className="mb-l">
        <Heading as="h1" size="h1">
          Umami Analytics
        </Heading>
        <Text as="p" size="caption" className="text-mid-grey-00">
          Last updated {fmtUpdated(generatedAt, timezone)}
        </Text>
        <div className="mt-s max-w-[220px]">
          <Select
            label="Date range"
            value={presetKey}
            onChange={(e) => changePreset(e.target.value)}
          >
            {presets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      </header>

      {/* Top pages */}
      <section className="mb-l">
        <div className="mb-s flex items-center justify-between gap-s">
          <Heading as="h2" size="h3">
            Top pages
          </Heading>
          <HowToButton target="uar-howto-pages" />
        </div>
        <div className={CARD}>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={TH}>Path</th>
                <th className={`${TH} ${NUM}`}>Pageviews</th>
                <th className={`${TH} ${NUM}`}>Visitors</th>
                <th className={TH}>Top source</th>
              </tr>
            </thead>
            <tbody>
              {current.pages.length === 0 ? (
                <tr>
                  <td className={`${TD} text-mid-grey-00`} colSpan={4}>
                    No page data for this range.
                  </td>
                </tr>
              ) : (
                current.pages.map((p) => (
                  <tr key={p.path}>
                    <td className={TD}>{p.path}</td>
                    <td className={`${TD} ${NUM}`}>{fmtInt(p.pageviews)}</td>
                    <td className={`${TD} ${NUM}`}>{fmtInt(p.visitors)}</td>
                    <SourceCell sources={p.topSources} onShow={setSrcPop} />
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top forms */}
      <section className="mb-l">
        <div className="mb-s flex items-center justify-between gap-s">
          <Heading as="h2" size="h3">
            Top forms
          </Heading>
          <HowToButton target="uar-howto-forms" />
        </div>
        <div className={CARD}>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={TH}>Form</th>
                <th className={`${TH} ${NUM}`}>Starts</th>
                <th className={`${TH} ${NUM}`}>Completion</th>
              </tr>
            </thead>
            <tbody>
              {forms.length === 0 ? (
                <tr>
                  <td className={`${TD} text-mid-grey-00`} colSpan={3}>
                    No form data for this range.
                  </td>
                </tr>
              ) : (
                forms.map((f) => (
                  <tr
                    key={f.formId}
                    tabIndex={0}
                    onClick={() => toggleForm(f.formId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleForm(f.formId)
                      }
                    }}
                    className={`cursor-pointer hover:bg-teal-10 ${activeForm === f.formId ? 'bg-teal-10' : ''}`}
                  >
                    <td className={TD}>
                      <Text as="span" size="caption" weight="bold">
                        {f.title}
                      </Text>
                      <Text
                        as="span"
                        size="small-caption"
                        className="block text-mid-grey-00"
                      >
                        {f.category}
                      </Text>
                    </td>
                    <td className={`${TD} ${NUM}`}>{fmtInt(f.starts)}</td>
                    <td className={`${TD} ${NUM}`}>
                      {fmtPct(f.completionPct)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Search */}
      <section className="mb-l">
        <div className="mb-s flex items-center justify-between gap-s">
          <Heading as="h2" size="h3">
            Search queries
          </Heading>
          <HowToButton target="uar-howto-search" />
        </div>
        <SearchSection search={current.search} />
      </section>

      {activeForm ? (
        <>
          <button
            type="button"
            aria-label="Close details"
            className="fixed inset-0 z-40 bg-black-00/40"
            onClick={() => setActiveForm(null)}
          />
          <aside className="fixed top-0 right-0 z-50 h-full w-[min(580px,94vw)] overflow-y-auto border-l border-grey-00 bg-white-00 p-l shadow-2xl">
            <button
              type="button"
              onClick={() => setActiveForm(null)}
              className="float-right rounded-md border border-grey-00 px-s py-xs text-caption"
            >
              Close ✕
            </button>
            <Heading as="h3" size="h4">
              {activeRow?.title ?? activeForm}
            </Heading>
            <Text as="p" size="small-caption" className="mb-s text-mid-grey-00">
              {activeForm} · {activeRow?.category}
            </Text>
            {activeRow && activeDetail ? (
              <FormDetailBody row={activeRow} detail={activeDetail} />
            ) : (
              <Text as="p" className="text-mid-grey-00">
                No detail recorded for this form in this range.
              </Text>
            )}
          </aside>
        </>
      ) : null}

      {srcPop ? (
        <div
          className="fixed z-[60] min-w-[210px] rounded-lg border border-grey-00 bg-white-00 p-s shadow-xl"
          style={{ left: srcPop.x, top: srcPop.y }}
        >
          <Text
            as="span"
            size="small-caption"
            className="mb-xs block uppercase text-mid-grey-00"
          >
            All sources
          </Text>
          {srcPop.sources.map((s) => (
            <div
              key={s.referrer}
              className="flex justify-between gap-m py-xs text-caption"
            >
              <span>{s.referrer}</span>
              <span className="text-mid-grey-00">{fmtInt(s.count)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <HowToPopovers />
    </div>
  )
}

function StatGrid({
  items,
}: {
  items: { label: string; value: React.ReactNode }[]
}) {
  return (
    <div className="flex flex-wrap gap-m rounded-lg bg-teal-10 p-s">
      {items.map((it) => (
        <div key={it.label}>
          <Text
            as="span"
            size="small-caption"
            className="block text-mid-grey-00"
          >
            {it.label}
          </Text>
          <Text as="span" size="body" weight="bold">
            {it.value}
          </Text>
        </div>
      ))}
    </div>
  )
}

function SourceCell({
  sources,
  onShow,
}: {
  sources: { referrer: string; count: number }[]
  onShow: (p: SrcPop | null) => void
}) {
  if (!sources.length) return <td className={`${TD} text-mid-grey-00`}>—</td>
  const top = sources[0]
  const hasMore = sources.length > 1
  return (
    <td
      className={`${TD} ${hasMore ? 'cursor-help' : ''}`}
      onMouseEnter={
        hasMore
          ? (e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              onShow({ sources, x: Math.max(8, r.left), y: r.bottom + 4 })
            }
          : undefined
      }
      onMouseLeave={hasMore ? () => onShow(null) : undefined}
    >
      {top.referrer}{' '}
      <span className="text-mid-grey-00">({fmtInt(top.count)})</span>
      {hasMore ? (
        <span className="text-mid-grey-00"> +{sources.length - 1}</span>
      ) : null}
    </td>
  )
}

function FormDetailBody({
  row,
  detail: d,
}: {
  row: FormRow
  detail: FormDetail
}) {
  const max = Math.max(1, ...d.funnel.map((s) => s.count))
  const starts = row.starts
  const ofStarts = (n: number) =>
    starts ? fmtPct(Math.round((n / starts) * 1000) / 10) : '—'
  const totalFieldErrors = d.fieldErrors.reduce((a, f) => a + f.count, 0)
  const totalReasons = d.errorTypes.reduce((a, t) => a + t.count, 0)
  return (
    <>
      <StatGrid
        items={[
          { label: 'Starts', value: fmtInt(starts) },
          {
            label: 'Completed',
            value: (
              <>
                {fmtInt(row.completes)}{' '}
                <span className="text-mid-grey-00">
                  ({fmtPct(row.completionPct)})
                </span>
              </>
            ),
          },
          {
            label: 'Avg time to complete',
            value: fmtDur(row.avgDurationSeconds),
          },
          { label: 'Field errors / start', value: row.avgFieldErrors },
          { label: 'Total field errors', value: fmtInt(totalFieldErrors) },
        ]}
      />
      <div className="mt-s flex flex-wrap gap-m">
        {[
          { label: 'Step back', value: d.stepBack },
          { label: 'Step edit', value: d.stepEdit },
          { label: 'Reviewed', value: d.review },
        ].map((it) => (
          <div key={it.label}>
            <Text
              as="span"
              size="small-caption"
              className="block text-mid-grey-00"
            >
              {it.label}
            </Text>
            <Text as="span" size="body" weight="bold">
              {fmtInt(it.value)}
            </Text>
          </div>
        ))}
      </div>

      <SubHeading>Funnel</SubHeading>
      <div className="flex max-w-[560px] flex-col gap-xs">
        {d.funnel.map((s) => (
          <div
            key={s.label}
            className="grid grid-cols-[90px_1fr_130px] items-center gap-s text-caption"
          >
            <span>{s.label}</span>
            <span className="rounded bg-teal-10">
              <span
                className="block h-[22px] min-w-[2px] rounded bg-teal-00"
                style={{ width: `${(100 * s.count) / max}%` }}
              />
            </span>
            <span className={NUM}>
              {fmtInt(s.count)}
              {/* dropoffPct > 0 = fewer than the previous step (drop-off, red);
                  < 0 = more than the previous step (increase, green). */}
              {s.dropoffPct ? (
                <span
                  className={s.dropoffPct < 0 ? 'text-green-00' : 'text-red-00'}
                >
                  {' '}
                  {s.dropoffPct < 0 ? '+' : '-'}
                  {fmtPct(Math.abs(s.dropoffPct))}
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      <SubHeading>Field errors — which fields fail and how often</SubHeading>
      {d.fieldErrors.length === 0 ? (
        <Text as="p" size="caption" className="text-mid-grey-00">
          No field validation errors recorded.
        </Text>
      ) : (
        <div className="max-w-[600px] overflow-x-auto rounded-lg border border-grey-00">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={TH}>Field</th>
                <th className={`${TH} ${NUM}`}>Errors</th>
                <th className={`${TH} ${NUM}`}>% of starts</th>
              </tr>
            </thead>
            <tbody>
              {d.fieldErrors.map((f) => (
                <tr key={f.field}>
                  <td className={TD}>{f.field}</td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(f.count)}</td>
                  <td className={`${TD} ${NUM}`}>{ofStarts(f.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SubHeading>Why fields fail — validation reasons</SubHeading>
      {d.errorTypes.length === 0 ? (
        <Text as="p" size="caption" className="text-mid-grey-00">
          No validation-error reasons recorded.
        </Text>
      ) : (
        <div className="max-w-[600px] overflow-x-auto rounded-lg border border-grey-00">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={TH}>Why it failed</th>
                <th className={TH}>Reason code</th>
                <th className={`${TH} ${NUM}`}>Occurrences</th>
                <th className={`${TH} ${NUM}`}>Share</th>
              </tr>
            </thead>
            <tbody>
              {d.errorTypes.map((t) => (
                <tr key={t.field}>
                  <td className={TD}>{reasonLabel(t.field)}</td>
                  <td className={TD}>
                    <code className="rounded bg-teal-10 px-xs text-small-caption">
                      {t.field}
                    </code>
                  </td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(t.count)}</td>
                  <td className={`${TD} ${NUM}`}>
                    {fmtPct(
                      totalReasons
                        ? Math.round((t.count / totalReasons) * 1000) / 10
                        : 0,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function SearchSection({ search: s }: { search: SearchReport }) {
  if (!s || (!s.submitTotal && !s.total)) {
    return (
      <Text as="p" size="caption" className="text-mid-grey-00">
        No search activity for this range.
      </Text>
    )
  }
  const QueryTable = ({
    rows,
  }: {
    rows: { query: string; count: number }[]
  }) =>
    rows.length === 0 ? (
      <Text as="p" size="caption" className="text-mid-grey-00">
        No queries recorded.
      </Text>
    ) : (
      <div className="max-w-[600px] overflow-x-auto rounded-lg border border-grey-00">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={TH}>Query</th>
              <th className={`${TH} ${NUM}`}>Searches</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.query}>
                <td className={TD}>{q.query}</td>
                <td className={`${TD} ${NUM}`}>{fmtInt(q.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  return (
    <div>
      <SubHeading>Search submissions (search-submit)</SubHeading>
      <StatGrid
        items={[{ label: 'Search submissions', value: fmtInt(s.submitTotal) }]}
      />
      {s.submitBySource.length ? (
        <>
          <SubHeading>By source</SubHeading>
          <div className="flex flex-wrap gap-xs">
            {s.submitBySource.map((b) => (
              <span
                key={b.source}
                className="rounded-full border border-grey-00 bg-teal-10 px-s py-xs text-small-caption"
              >
                {b.source} · {fmtInt(b.count)}
              </span>
            ))}
          </div>
        </>
      ) : null}
      <SubHeading>Top search queries (submitted)</SubHeading>
      <QueryTable rows={s.submitTopQueries} />

      <SubHeading>Results-page searches (search)</SubHeading>
      {s.total ? (
        <>
          <StatGrid
            items={[
              { label: 'Searches with results page', value: fmtInt(s.total) },
              {
                label: 'Returned no results',
                value: (
                  <>
                    {fmtInt(s.zeroResults)}{' '}
                    <span className="text-mid-grey-00">
                      ({fmtPct(s.zeroResultsPct)})
                    </span>
                  </>
                ),
              },
            ]}
          />
          <SubHeading>Top queries (results page)</SubHeading>
          <QueryTable rows={s.topQueries} />
        </>
      ) : (
        <Text as="p" size="caption" className="text-mid-grey-00">
          No results-page <code>search</code> events in this range (only
          submissions above).
        </Text>
      )}
      <Text as="p" size="small-caption" className="mt-s text-mid-grey-00">
        Click-through rate is not shown: result clicks are not tracked yet. The
        no-results rate is the closest search-quality signal.
      </Text>
    </div>
  )
}

function HowToPopovers() {
  return (
    <>
      <div id="uar-howto-pages" popover="auto" className="uar-pop">
        <Heading as="h3" size="h5">
          Top pages — how it works
        </Heading>
        <Text as="p" size="caption" className="mt-xs">
          Most-visited landing pages over the selected range (Umami pageviews),
          top 10. <b>Top source</b> lists the leading referrers to each page —
          hover to see all; <code>(direct)</code> = no referrer.
        </Text>
      </div>
      <div id="uar-howto-forms" popover="auto" className="uar-pop">
        <Heading as="h3" size="h5">
          Top forms — how it works
        </Heading>
        <Text as="p" size="caption" className="mt-xs">
          Per form over the range, by starts (top 10). <b>Completion</b> =
          successful submits ÷ starts. Click a row for avg time, field errors
          per start, the step funnel, the fields that fail most, and{' '}
          <em>why</em> they fail.
        </Text>
      </div>
      <div id="uar-howto-search" popover="auto" className="uar-pop">
        <Heading as="h3" size="h5">
          Search queries — how it works
        </Heading>
        <Text as="p" size="caption" className="mt-xs">
          <b>Search submissions</b> (<code>search-submit</code>) is every
          search-box submission, with top queries and a breakdown by where the
          search ran. <b>Results-page searches</b> (<code>search</code>) gives
          the no-results rate; it may be empty when only submissions fired.
        </Text>
      </div>
    </>
  )
}

// Only the native popover needs raw CSS (it's a top-layer element with a
// backdrop); the rest of the page is design-system components + Tailwind tokens.
const POPOVER_CSS = `
.uar-pop { max-width: min(460px, 92vw); border: 1px solid var(--color-grey-00); border-radius: 12px; padding: 18px 20px; box-shadow: 0 16px 48px rgba(0,0,0,.22); background: #fff; }
.uar-pop::backdrop { background: rgba(0,0,0,.3); }
.uar-pop code { background: var(--color-teal-10); padding: 1px 5px; border-radius: 4px; }
`
