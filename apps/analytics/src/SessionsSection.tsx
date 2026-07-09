import { Heading, Text } from '@govtech-bb/react'
import * as React from 'react'
import type {
  FormFunnel,
  FunnelStep,
  SessionReport,
} from '@govtech-bb/umami-analytics'

// Consolidated, SESSION-BASED views (distinct sessions, not raw events):
//  - form funnels with reached-vs-completed per step (#1914/#1915)
//  - submit-error rate as a first-class metric (#1916)
//  - flow, entry/exit, devices, countries (folds in the standalone journeys app)
// Freshness (#1917) is shown from generatedAt + the report window.

const fmtInt = (n: number) => n.toLocaleString()
const fmtPct = (n: number) => `${(n * 100).toFixed(1).replace(/\.0$/, '')}%`

const TH =
  'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'
const CARD = 'overflow-x-auto rounded-lg border border-grey-00'

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((100 * value) / max) : 0
  return (
    <div className="h-2 w-full rounded bg-grey-00">
      <div className="h-2 rounded bg-teal-00" style={{ width: `${pct}%` }} />
    </div>
  )
}

function CountList({
  title,
  rows,
  labelHead,
}: {
  title: string
  rows: { key: string; count: number }[]
  labelHead: string
}) {
  return (
    <div>
      <Heading as="h3" size="h4" className="mb-xs">
        {title}
      </Heading>
      <div className={CARD}>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={TH}>{labelHead}</th>
              <th className={`${TH} ${NUM}`}>Sessions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={`${TD} text-mid-grey-00`} colSpan={2}>
                  No data.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key}>
                  <td className={TD}>{r.key || '(none)'}</td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(r.count)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FunnelCard({ f }: { f: FormFunnel }) {
  const max = Math.max(
    f.started,
    ...f.steps.map((s: FunnelStep) => s.reached || s.completed),
    1,
  )
  const hasReached = f.steps.some((s) => s.reached > 0)
  return (
    <div className={`${CARD} p-m`}>
      <div className="flex flex-wrap items-baseline justify-between gap-s">
        <Heading as="h3" size="h4">
          {f.form}
        </Heading>
        <Text as="span" size="caption" className="text-mid-grey-00">
          {fmtInt(f.started)} started · {fmtInt(f.submitted)} submitted ·{' '}
          {fmtPct(f.completion)} completion
        </Text>
      </div>

      {/* Submit-error rate (#1916) */}
      {f.friction.submitErrors > 0 && (
        <Text as="p" size="caption" className="mt-xs font-bold text-error-00">
          ⚠ {fmtInt(f.friction.submitErrors)} submit error
          {f.friction.submitErrors === 1 ? '' : 's'} (
          {fmtPct(f.submitErrorRate)} of submit attempts)
        </Text>
      )}

      {/* Per-step reached vs completed (#1914/#1915) */}
      {f.steps.length > 0 ? (
        <table className="mt-s min-w-full">
          <thead>
            <tr>
              <th className={TH}>Step</th>
              <th className={`${TH} ${NUM}`}>Reached</th>
              <th className={`${TH} ${NUM}`}>Completed</th>
              <th className={`${TH} ${NUM}`}>Abandoned in step</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {f.steps.map((s) => (
              <tr key={s.slug}>
                <td className={TD}>{s.label}</td>
                <td className={`${TD} ${NUM}`}>
                  {hasReached ? fmtInt(s.reached) : '—'}
                </td>
                <td className={`${TD} ${NUM}`}>{fmtInt(s.completed)}</td>
                <td className={`${TD} ${NUM}`}>
                  {hasReached ? fmtInt(s.abandonedInStep) : '—'}
                </td>
                <td className={`${TD} w-[30%]`}>
                  <Bar value={s.completed} max={max} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Text as="p" size="caption" className="mt-s text-mid-grey-00">
          No per-step data yet — the form doesn't carry the step in its URL. See
          issue #1931.
        </Text>
      )}

      <div className="mt-s flex flex-wrap gap-m">
        <Text as="span" size="caption" className="text-mid-grey-00">
          Reached review: {fmtInt(f.reachedReview)}
        </Text>
        <Text as="span" size="caption" className="text-mid-grey-00">
          Went back: {fmtInt(f.friction.wentBack)}
        </Text>
        <Text as="span" size="caption" className="text-mid-grey-00">
          Edited answers: {fmtInt(f.friction.editedAnswers)}
        </Text>
        <Text as="span" size="caption" className="text-mid-grey-00">
          Validation errors: {fmtInt(f.friction.validationErrors)}
        </Text>
      </div>
    </div>
  )
}

export function SessionsSection({ report }: { report: SessionReport }) {
  const t = report.totals
  return (
    <section className="mb-l" aria-labelledby="uar-sessions">
      <Heading as="h2" size="h3" id="uar-sessions" className="mb-xs">
        Journeys &amp; funnels (session-based)
      </Heading>
      <Text as="p" size="caption" className="mb-s text-mid-grey-00">
        Distinct sessions over the last {report.window.days} days —{' '}
        {fmtInt(t.sessions)} sessions, {fmtInt(t.pageviews)} pageviews,{' '}
        {fmtPct(t.bounceRate)} bounce rate. Counts are per-session (not raw
        events), so they differ from the event-based tables above.
      </Text>

      {/* Form funnels */}
      <div className="grid gap-m">
        {report.funnels.length === 0 ? (
          <Text as="p" size="caption" className="text-mid-grey-00">
            No form funnels in this window.
          </Text>
        ) : (
          report.funnels.map((f) => <FunnelCard key={f.form} f={f} />)
        )}
      </div>

      {/* Consolidation: entry / exit / devices / countries */}
      <div className="mt-l grid gap-m md:grid-cols-2">
        <CountList title="Entry pages" labelHead="Page" rows={report.entries} />
        <CountList title="Exit pages" labelHead="Page" rows={report.exits} />
        <CountList title="Devices" labelHead="Device" rows={report.devices} />
        <CountList
          title="Countries"
          labelHead="Country"
          rows={report.countries}
        />
      </div>

      {/* Top journeys */}
      <div className="mt-l">
        <Heading as="h3" size="h4" className="mb-xs">
          Most common journeys
        </Heading>
        <div className={CARD}>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={TH}>Path</th>
                <th className={`${TH} ${NUM}`}>Sessions</th>
                <th className={`${TH} ${NUM}`}>Share</th>
              </tr>
            </thead>
            <tbody>
              {report.topJourneys.slice(0, 12).map((j, i) => (
                <tr key={i}>
                  <td className={TD}>{j.steps.join(' › ')}</td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(j.count)}</td>
                  <td className={`${TD} ${NUM}`}>{fmtPct(j.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
