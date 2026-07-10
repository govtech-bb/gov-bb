import { Heading, Text } from '@govtech-bb/react'
import * as React from 'react'
import { fetchFormDetail } from './lib/report'
import type { OverviewPayload } from './lib/report'
import type { FormDetailData } from './lib/umami-server'

// --- formatting helpers ---
const fmtInt = (n: number) => n.toLocaleString()
const fmtPct = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}%`

// --- shared class fragments (design-system tokens) ---
const TH =
  'px-s py-s text-left text-caption font-bold uppercase tracking-wide text-mid-grey-00'
const TD = 'px-s py-s align-top text-caption border-t border-grey-00'
const NUM = 'text-right tabular-nums'
const CARD = 'overflow-x-auto rounded-lg border border-grey-00'

export default function AnalyticsPage({
  overview,
}: {
  overview: OverviewPayload
}) {
  const [activeForm, setActiveForm] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<FormDetailData | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function openForm(formId: string) {
    setActiveForm(formId)
    setDetail(null)
    setLoading(true)
    try {
      setDetail(await fetchFormDetail({ data: formId }))
    } finally {
      setLoading(false)
    }
  }

  if (!overview.configured) {
    return (
      <div className="container py-8">
        <Heading as="h1" size="h1">
          Umami Analytics
        </Heading>
        <Text as="p" className="mt-s text-mid-grey-00">
          Analytics is not configured. Set <code>UMAMI_API_KEY</code>,{' '}
          <code>UMAMI_LANDING_WEBSITE_ID</code> and{' '}
          <code>UMAMI_FORMS_WEBSITE_ID</code> on the deployment.
        </Text>
      </div>
    )
  }

  const activeTitle =
    overview.forms.find((f) => f.formId === activeForm)?.title ?? activeForm

  return (
    <div className="container py-8">
      <header className="mb-l">
        <Heading as="h1" size="h1">
          Umami Analytics
        </Heading>
        <Text as="p" size="caption" className="text-mid-grey-00">
          Live — last 30 days · {fmtInt(overview.stats.visitors)} visitors ·{' '}
          {fmtInt(overview.stats.pageviews)} pageviews
        </Text>
      </header>

      {/* Top pages */}
      <section className="mb-l">
        <Heading as="h2" size="h3" className="mb-s">
          Top pages
        </Heading>
        <div className={CARD}>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={TH}>Path</th>
                <th className={`${TH} ${NUM}`}>Pageviews</th>
                <th className={`${TH} ${NUM}`}>Visitors</th>
              </tr>
            </thead>
            <tbody>
              {overview.pages.length === 0 ? (
                <tr>
                  <td className={`${TD} text-mid-grey-00`} colSpan={3}>
                    No page data.
                  </td>
                </tr>
              ) : (
                overview.pages.map((p) => (
                  <tr key={p.path}>
                    <td className={TD}>{p.path}</td>
                    <td className={`${TD} ${NUM}`}>{fmtInt(p.pageviews)}</td>
                    <td className={`${TD} ${NUM}`}>{fmtInt(p.visitors)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Forms */}
      <section className="mb-l">
        <Heading as="h2" size="h3" className="mb-s">
          Forms
        </Heading>
        <Text as="p" size="caption" className="mb-s text-mid-grey-00">
          Select a form to load its funnel and journey (fetched live).
        </Text>
        <div className={CARD}>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={TH}>Form</th>
                <th className={`${TH} ${NUM}`}></th>
              </tr>
            </thead>
            <tbody>
              {overview.forms.length === 0 ? (
                <tr>
                  <td className={`${TD} text-mid-grey-00`} colSpan={2}>
                    No forms found.
                  </td>
                </tr>
              ) : (
                overview.forms.map((f) => (
                  <tr
                    key={f.formId}
                    tabIndex={0}
                    onClick={() => openForm(f.formId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openForm(f.formId)
                      }
                    }}
                    className={`cursor-pointer hover:bg-teal-10 ${activeForm === f.formId ? 'bg-teal-10' : ''}`}
                  >
                    <td className={TD}>
                      <Text as="span" size="caption" weight="bold">
                        {f.title}
                      </Text>
                    </td>
                    <td className={`${TD} ${NUM} text-mid-grey-00`}>View →</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
              {activeTitle}
            </Heading>
            <Text as="p" size="small-caption" className="mb-s text-mid-grey-00">
              {activeForm}
            </Text>
            {loading || !detail ? (
              <Text as="p" className="text-mid-grey-00">
                {loading ? 'Loading…' : 'No data.'}
              </Text>
            ) : (
              <FormDetailBody detail={detail} />
            )}
          </aside>
        </>
      ) : null}
    </div>
  )
}

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

function FormDetailBody({ detail }: { detail: FormDetailData }) {
  const max = Math.max(1, ...detail.funnel.map((s) => s.count))
  return (
    <>
      {detail.submitErrorRate != null ? (
        <Text as="p" size="caption" className="mt-s">
          Submit-error rate: <b>{fmtPct(detail.submitErrorRate * 100)}</b>
        </Text>
      ) : null}

      <SubHeading>Funnel (distinct visitors)</SubHeading>
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
                <th className={TH}>Path</th>
                <th className={`${TH} ${NUM}`}>Count</th>
              </tr>
            </thead>
            <tbody>
              {detail.journey.map((j, i) => (
                <tr key={i}>
                  <td className={TD}>{j.items.join(' › ')}</td>
                  <td className={`${TD} ${NUM}`}>{fmtInt(j.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
