import { Heading, Text } from '@govtech-bb/react'
import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AnalyticsHeader } from './components/AnalyticsHeader'
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

// Human labels for the common validation reason codes; unmapped values (the
// form's own messages, e.g. "Parish is required") fall through unchanged.
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

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <Heading as="h2" size="h3" className="mt-l mb-s">
      {children}
    </Heading>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Text as="span" size="small-caption" className="block text-mid-grey-00">
        {label}
      </Text>
      <Text as="span" size="body" weight="bold">
        {value}
      </Text>
    </div>
  )
}

export default function FormPage({ detail }: { detail: FormDetailData }) {
  const navigate = useNavigate()
  return (
    <div className="container py-8">
      <AnalyticsHeader
        title={detail.title}
        subtitle={detail.formId}
        backTo="/"
        range={detail.range}
        onRangeChange={(range) =>
          navigate({
            to: '/analytics/forms/$formId',
            params: { formId: detail.formId },
            search: { range },
          })
        }
      />

      <Stats detail={detail} />
      <Funnel detail={detail} />
      <ValidationReasons detail={detail} />
      <SubmitReliability detail={detail} />
    </div>
  )
}

// Headline stats: starts, completion rate and avg time to complete (distinct
// visitors), plus field-error and step counters.
function Stats({ detail }: { detail: FormDetailData }) {
  return (
    <>
      <div className="mt-s rounded-lg bg-teal-10 p-m">
        <div className="flex flex-wrap gap-l">
          <Stat label="Starts" value={fmtInt(detail.starts)} />
          <Stat
            label="Completed"
            value={
              <>
                {fmtInt(detail.completed)}{' '}
                <span className="text-mid-grey-00">
                  ({fmtPct(detail.completionPct)})
                </span>
              </>
            }
          />
          <Stat
            label="Avg time to complete"
            value={fmtDur(detail.avgDurationSeconds)}
          />
        </div>
        <div className="mt-m flex flex-wrap gap-l">
          <Stat label="Field errors / start" value={detail.avgFieldErrors} />
          <Stat
            label="Total field errors"
            value={fmtInt(detail.totalFieldErrors)}
          />
        </div>
      </div>
      <div className="mt-s flex flex-wrap gap-l">
        <Stat label="Step back" value={fmtInt(detail.stepBack)} />
        <Stat label="Step edit" value={fmtInt(detail.stepEdit)} />
        <Stat label="Reviewed" value={fmtInt(detail.reviewed)} />
      </div>
      <Text as="p" size="small-caption" className="mt-xs text-mid-grey-00">
        Starts, Completed and completion rate are <b>distinct visitors</b>. The
        remaining counters are events.
      </Text>
    </>
  )
}

// Step funnel: Start → Step N → Submit, with the step-over-step change.
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
        <div className="flex max-w-[620px] flex-col gap-xs">
          {detail.funnel.map((s) => (
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
                {/* dropoffPct > 0 = fewer than the previous step (drop, red);
                    < 0 = more than the previous step (increase, green). */}
                {s.dropoffPct > 0 ? (
                  <span className="text-red-00"> -{fmtPct(s.dropoffPct)}</span>
                ) : s.dropoffPct < 0 ? (
                  <span className="text-green-00">
                    {' '}
                    +{fmtPct(Math.abs(s.dropoffPct))}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}
      <Text as="p" size="small-caption" className="mt-xs text-mid-grey-00">
        Visitors reaching each step, with the change from the previous step.
        Step counts are events (a reload or back re-fires).
      </Text>
    </section>
  )
}

function ValidationReasons({ detail }: { detail: FormDetailData }) {
  const total = detail.validationReasons.reduce((a, t) => a + t.count, 0)
  return (
    <section>
      <SubHeading>Why fields fail — validation reasons</SubHeading>
      {detail.validationReasons.length === 0 ? (
        <Text as="p" size="caption" className="text-mid-grey-00">
          No validation-error reasons recorded.
        </Text>
      ) : (
        <div className={CARD}>
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
              {detail.validationReasons.map((t) => (
                <tr key={t.field}>
                  <td className={TD}>{reasonLabel(t.field)}</td>
                  <td className={TD}>
                    <code className="rounded bg-teal-10 px-xs text-small-caption">
                      {t.field}
                    </code>
                  </td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(t.count)}</td>
                  <td className={`${TD} ${NUM}`}>
                    {total
                      ? fmtPct(Math.round((t.count / total) * 1000) / 10)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// #1916 — submit-error as a first-class reliability metric.
function SubmitReliability({ detail }: { detail: FormDetailData }) {
  const { submitError: se } = detail
  if (se.attempts === 0) return null
  return (
    <section>
      <SubHeading>Submit reliability</SubHeading>
      <div className="flex flex-wrap gap-l rounded-lg bg-teal-10 p-m">
        <Stat
          label="Submit-error rate"
          value={se.rate == null ? '—' : fmtPct(se.rate * 100)}
        />
        <Stat label="Errors" value={fmtInt(se.total)} />
        <Stat label="Submit attempts" value={fmtInt(se.attempts)} />
      </div>
      {se.byReason.length > 0 ? (
        <div className="mt-s flex flex-wrap gap-xs">
          {se.byReason.map((r) => (
            <span
              key={r.reason}
              className="rounded-full border border-grey-00 bg-white-00 px-s py-xs text-small-caption"
            >
              {r.reason} · {fmtInt(r.count)}
            </span>
          ))}
        </div>
      ) : null}
      <Text as="p" size="small-caption" className="mt-xs text-mid-grey-00">
        Errors ÷ submit attempts (successful submits + submit errors). A submit
        that fails (network / payment / server) is counted here, not as
        abandonment.
      </Text>
    </section>
  )
}
