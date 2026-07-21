import { Heading, Text } from '@govtech-bb/react'
import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AnalyticsChrome } from './components/AnalyticsChrome'
import { StatCards } from './components/StatCards'
import type { FormDetailData } from './lib/umami-server'

const fmtInt = (n: number) => n.toLocaleString()
const fmtPct = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}%`
const fmtDur = (s: number | null) =>
  s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`

const TH =
  'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'
const CARD = 'overflow-x-auto rounded-lg border border-grey-00'

// Friendly labels for the stable reason codes (the rule type that failed, or a
// synthetic date code). Unmapped codes fall through to the raw code.
const REASONS: Record<string, string> = {
  required: 'Required field left blank',
  pattern: "Doesn't match the required format",
  email: 'Not a valid email address',
  phone: 'Not a valid phone number',
  minLength: 'Too short',
  maxLength: 'Too long',
  min: 'Below the minimum',
  max: 'Above the maximum',
  contains: 'Missing required text',
  strictEquality: "Doesn't match the other field",
  minItems: 'Too few selected',
  maxItems: 'Too many selected',
  minSelection: 'Too few selected',
  maxSelection: 'Too many selected',
  radio: 'No option chosen',
  fileTypes: 'File type not allowed',
  maxSize: 'File too large',
  itemMaxSize: 'File too large',
  minYear: 'Year too early',
  maxYear: 'Year too late',
  past: 'Date must be in the past',
  pastOrToday: 'Date must be today or earlier',
  future: 'Date must be in the future',
  futureOrToday: 'Date must be today or later',
  after: 'Date too early',
  onOrAfter: 'Date too early',
  before: 'Date too late',
  onOrBefore: 'Date too late',
  invalid_date: 'Not a real date',
  incomplete_date: 'Date incomplete',
}
const reasonLabel = (code: string) => REASONS[code] ?? code

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <Heading as="h2" size="h3" className="mt-l mb-s">
      {children}
    </Heading>
  )
}

export default function FormPage({ detail }: { detail: FormDetailData }) {
  const navigate = useNavigate()
  return (
    <>
      <AnalyticsChrome
        range={detail.range}
        onRangeChange={(range) =>
          navigate({
            to: '/analytics/forms/$formId',
            params: { formId: detail.formId },
            search: { range },
          })
        }
      />
      <div className="container py-8">
       
        <header className="mt-s mb-l">
          <Heading as="h1" size="h1">
            {detail.title}
          </Heading>
          <Text as="p" size="small-caption" className="text-mid-grey-00">
            {detail.formId}
          </Text>
        </header>

        <Stats detail={detail} />
        <Funnel detail={detail} />
        <FieldFailures detail={detail} />
      </div>
    </>
  )
}

// A big value with a small grey sub-line of context (e.g. "159 of 177 visits").
function withSub(value: ReactNode, sub: string): ReactNode {
  return (
    <>
      {value}
      <span className="block text-caption font-normal text-mid-grey-00">
        {sub}
      </span>
    </>
  )
}

// A tooltip body: a bold title, an explanation, and optional extra nodes.
function Hint({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <>
      <span className="block font-bold">{title}</span>
      <span className="mt-xs block text-mid-grey-00">{children}</span>
    </>
  )
}

// Headline: the form's conversion/quality metrics, each with a hover/focus
// explanation. Form failures carries the submit-error reason breakdown.
function Stats({ detail }: { detail: FormDetailData }) {
  const se = detail.submitError
  return (
    <>
      <StatCards
        cards={[
          {
            label: 'Visits that started',
            value: withSub(
              fmtPct(detail.visitsToStartsPct),
              `${fmtInt(detail.starts)} of ${fmtInt(detail.visits)} visits`,
            ),
            hint: (
              <Hint title="Visits that started">
                Of the distinct visitors who opened the form page, the share who
                then began filling it in (fired <code>form-start</code>).
              </Hint>
            ),
          },
          {
            label: 'Completion rate',
            value: withSub(
              fmtPct(detail.completionPct),
              `${fmtInt(detail.completed)} of ${fmtInt(detail.starts)} starts`,
            ),
            hint: (
              <Hint title="Completion rate">
                Of the distinct visitors who started, the share who reached a
                successful submit. Failed submit attempts don’t count as
                completions.
              </Hint>
            ),
          },
          {
            label: 'Avg time to complete',
            value: fmtDur(detail.avgDurationSeconds),
            hint: (
              <Hint title="Avg time to complete">
                Average time from starting the form to a successful submit,
                across the visitors who completed it.
              </Hint>
            ),
          },
          {
            label: 'Field validation errors',
            value: fmtInt(detail.totalFieldErrors),
            hint: (
              <Hint title="Field validation errors">
                Every time a field failed client-side validation when a visitor
                tried to advance a step (an event count, not distinct visitors).
              </Hint>
            ),
          },
          {
            label: 'Form failures',
            value: fmtInt(se.total),
            hint: (
              <Hint title="Form failures">
                Submissions that failed at the API (network, payment or server)
                — <code>form-submit-error</code> events. These are attempts, not
                completions; a visitor who fails can retry, so a failure isn’t
                counted as abandonment.
                {se.attempts > 0 && se.rate != null ? (
                  <span className="mt-xs block">
                    {fmtPct(se.rate * 100)} of {fmtInt(se.attempts)} submit
                    attempts (successful submits + failures).
                  </span>
                ) : null}
                {se.byReason.length > 0 ? (
                  <span className="mt-xs flex flex-wrap gap-xs">
                    {se.byReason.map((r) => (
                      <span
                        key={r.reason}
                        className="rounded-full border border-grey-00 px-xs py-[1px] text-small-caption"
                      >
                        {r.reason} · {fmtInt(r.count)}
                      </span>
                    ))}
                  </span>
                ) : null}
              </Hint>
            ),
          },
        ]}
      />
      <Text as="p" size="small-caption" className="mt-xs text-mid-grey-00">
        Visits, starts and completion are <b>distinct visitors</b> (Umami funnel
        report); field errors and form failures are event counts. Hover a card
        for detail.
      </Text>
    </>
  )
}

// Step funnel: Start → each defined step (with its title) → Submit. Rows are
// keyed by step identity (the form-step-view stepId), so a conditional step a
// visitor's answers skip shows fewer or zero views.
function Funnel({ detail }: { detail: FormDetailData }) {
  const max = Math.max(1, ...detail.funnel.map((s) => s.count))
  return (
    <section>
      <SubHeading>Funnel</SubHeading>
      {detail.funnel.length === 0 ? (
        <Text as="p" size="caption" className="text-mid-grey-00">
          No step data for this form in this range.
        </Text>
      ) : (
        <div className="flex flex-col gap-xs">
          {detail.funnel.map((s) => (
            <div
              key={s.label}
              className="grid grid-cols-[minmax(0,1fr)_140px_70px] items-center gap-s text-caption"
            >
              <span>{s.label}</span>
              <span className="rounded bg-teal-10">
                <span
                  className="block h-[22px] min-w-[2px] rounded bg-teal-00"
                  style={{ width: `${(100 * s.count) / max}%` }}
                />
              </span>
              <span className={NUM}>{fmtInt(s.count)}</span>
            </div>
          ))}
        </div>
      )}
      <Text as="p" size="small-caption" className="mt-xs text-mid-grey-00">
        Times each step was viewed (events; a reload or back re-fires). Steps a
        visitor's answers skip show fewer or zero views.
      </Text>
    </section>
  )
}

// Which fields fail validation, most-problematic first, with each field's
// reason breakdown. The worst field is called out above the table. Hovering a
// reason chip reveals the full error message a user would have seen.
function FieldFailures({ detail }: { detail: FormDetailData }) {
  const failures = detail.fieldFailures
  const total = failures.reduce((a, f) => a + f.count, 0)
  const worst = failures[0]
  return (
    <section>
      <SubHeading>Which fields fail</SubHeading>
      {failures.length === 0 ? (
        <Text as="p" size="caption" className="text-mid-grey-00">
          No field validation errors recorded.
        </Text>
      ) : (
        <>
          {worst ? (
            <div className="mb-s rounded-lg border border-red-00 bg-red-10 px-m py-s">
              <Text
                as="p"
                size="small-caption"
                className="font-bold uppercase tracking-wide text-red-00"
              >
                Most problematic field
              </Text>
              <Text as="p" size="caption" className="mt-xs">
                <b>{worst.label}</b> — {fmtInt(worst.count)}{' '}
                {worst.count === 1 ? 'failure' : 'failures'}
                {total
                  ? ` (${fmtPct(Math.round((worst.count / total) * 1000) / 10)} of all field errors)`
                  : ''}
              </Text>
            </div>
          ) : null}
          <div className={CARD}>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={TH}>Field</th>
                  <th className={`${TH} ${NUM}`}>Occurrences</th>
                  <th className={`${TH} ${NUM}`}>Share</th>
                  <th className={TH}>Reasons</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((f) => (
                  <tr key={f.fieldId}>
                    <td className={TD}>
                      {f.label}
                      <span className="mt-xs block">
                        <code className="rounded bg-teal-10 px-xs text-small-caption">
                          {f.fieldId}
                        </code>
                      </span>
                    </td>
                    <td className={`${TD} ${NUM}`}>{fmtInt(f.count)}</td>
                    <td className={`${TD} ${NUM}`}>
                      {total
                        ? fmtPct(Math.round((f.count / total) * 1000) / 10)
                        : '—'}
                    </td>
                    <td className={TD}>
                      <span className="flex flex-wrap gap-xs">
                        {f.reasons.map((r) => (
                          <span
                            key={r.code}
                            title={r.message || undefined}
                            className={`rounded-full border border-grey-00 px-xs py-[1px] text-small-caption ${
                              r.message ? 'cursor-help' : ''
                            }`}
                          >
                            {reasonLabel(r.code)} · {fmtInt(r.count)}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Text as="p" size="small-caption" className="mt-xs text-mid-grey-00">
            Each row is a field that failed client-side validation when a visitor
            tried to advance a step (event counts). Hover a reason to see the full
            message shown to the user.
          </Text>
        </>
      )}
    </section>
  )
}
