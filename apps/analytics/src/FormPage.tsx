import { Heading, Text } from '@govtech-bb/react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { FreshnessBanner } from './components/FreshnessBanner'
import { SortHeader, useTableSort } from './components/SortableTable'
import type { FormDetailData } from './lib/umami-server'

const fmtInt = (n: number) => n.toLocaleString()
const fmtPct = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}%`

const TH =
  'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'
const CARD = 'overflow-x-auto rounded-lg border border-grey-00'

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <Heading as="h2" size="h3" className="mt-l mb-s">
      {children}
    </Heading>
  )
}

export default function FormPage({ detail }: { detail: FormDetailData }) {
  return (
    <div className="container py-8">
      <Link
        to="/"
        className="text-caption text-teal-00 underline"
      >
        ← All forms
      </Link>

      <header className="mt-s mb-l">
        <Heading as="h1" size="h1">
          {detail.title}
        </Heading>
        <Text as="p" size="small-caption" className="text-mid-grey-00">
          {detail.formId}
        </Text>
        <FreshnessBanner window={detail.window} generatedAt={detail.generatedAt} />
      </header>

      <SubmitReliability detail={detail} />
      <Funnel detail={detail} />
      <Steps detail={detail} />
      <Journeys detail={detail} />
    </div>
  )
}

// #1916 — submit-error as a first-class reliability metric.
function SubmitReliability({ detail }: { detail: FormDetailData }) {
  const { submitError: se } = detail
  return (
    <section>
      <SubHeading>Submit reliability</SubHeading>
      {se.attempts === 0 ? (
        <Text as="p" size="caption" className="text-mid-grey-00">
          No submit attempts in this window.
        </Text>
      ) : (
        <>
          <div className="flex flex-wrap gap-m rounded-lg bg-teal-10 p-s">
            {[
              {
                label: 'Submit-error rate',
                value: se.rate == null ? '—' : fmtPct(se.rate * 100),
              },
              { label: 'Errors', value: fmtInt(se.total) },
              { label: 'Submit attempts', value: fmtInt(se.attempts) },
            ].map((it) => (
              <div key={it.label}>
                <Text as="span" size="small-caption" className="block text-mid-grey-00">
                  {it.label}
                </Text>
                <Text as="span" size="body" weight="bold">
                  {it.value}
                </Text>
              </div>
            ))}
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
            Errors ÷ submit attempts (successful submits + submit errors). A
            submit that fails (network / payment / server) is counted here, not as
            abandonment.
          </Text>
        </>
      )}
    </section>
  )
}

// #1914 — distinct-visitor funnel (start → review → submit).
function Funnel({ detail }: { detail: FormDetailData }) {
  const max = Math.max(1, ...detail.funnel.map((s) => s.count))
  return (
    <section>
      <SubHeading>Funnel — distinct visitors</SubHeading>
      {detail.funnel.length === 0 ? (
        <Text as="p" size="caption" className="text-mid-grey-00">
          No funnel data for this form.
        </Text>
      ) : (
        <div className="flex max-w-[560px] flex-col gap-xs">
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
                {s.dropoffPct ? (
                  <span className="text-red-00"> -{fmtPct(s.dropoffPct)}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}
      <Text as="p" size="small-caption" className="mt-xs text-mid-grey-00">
        Distinct visitors reaching each stage (Umami funnel report) — deduped, not
        raw event counts.
      </Text>
    </section>
  )
}

// #1915 — per-step reached vs completed.
function Steps({ detail }: { detail: FormDetailData }) {
  // Default: the form's declared step order (no sort key); columns are sortable.
  const sort = useTableSort(detail.steps, {
    step: (s) => s.title,
    reached: (s) => s.reached,
    completed: (s) => s.completed,
    abandoned: (s) => s.abandoned,
  })
  return (
    <section>
      <SubHeading>Per-step: reached vs completed</SubHeading>
      {detail.steps.length === 0 ? (
        <Text as="p" size="caption" className="text-mid-grey-00">
          No per-step data for this form.
        </Text>
      ) : (
        <div className={CARD}>
          <table className="min-w-full">
            <thead>
              <tr>
                <SortHeader label="Step" colKey="step" sort={sort} className={TH} />
                <SortHeader label="Reached" colKey="reached" sort={sort} className={`${TH} ${NUM}`} />
                <SortHeader label="Completed" colKey="completed" sort={sort} className={`${TH} ${NUM}`} />
                <SortHeader label="Abandoned" colKey="abandoned" sort={sort} className={`${TH} ${NUM}`} />
              </tr>
            </thead>
            <tbody>
              {sort.sorted.map((s) => (
                <tr key={s.stepId}>
                  <td className={TD}>{s.title}</td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(s.reached)}</td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(s.completed)}</td>
                  <td className={`${TD} ${NUM}`}>
                    {s.abandoned ? (
                      <span className="text-red-00">{fmtInt(s.abandoned)}</span>
                    ) : (
                      fmtInt(s.abandoned)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Text as="p" size="small-caption" className="mt-xs text-mid-grey-00">
        Reached = <code>form-step-view</code> events; completed = advanced to the
        next step; abandoned = reached − completed. These are view counts (a
        reload or back re-fires), so this view is not deduped like the funnel
        above — distinct per-step needs the step in the URL (#1931).
      </Text>
    </section>
  )
}

function Journeys({ detail }: { detail: FormDetailData }) {
  const sort = useTableSort(
    detail.journey,
    {
      path: (j) => j.items.join(' › '),
      count: (j) => j.count,
    },
    'count',
    'desc',
  )
  return (
    <section>
      <SubHeading>Top journeys</SubHeading>
      {detail.journey.length === 0 ? (
        <Text as="p" size="caption" className="text-mid-grey-00">
          No journey data.
        </Text>
      ) : (
        <div className={CARD}>
          <table className="min-w-full">
            <thead>
              <tr>
                <SortHeader label="Path" colKey="path" sort={sort} className={TH} />
                <SortHeader label="Count" colKey="count" sort={sort} className={`${TH} ${NUM}`} />
              </tr>
            </thead>
            <tbody>
              {sort.sorted.map((j) => (
                <tr key={j.items.join('>')}>
                  <td className={TD}>{j.items.join(' › ')}</td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(j.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
