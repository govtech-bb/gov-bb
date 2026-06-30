import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import {
  getAnalytics,
  getFormDetail,
  type AnalyticsView,
  type FormDetailView,
} from '../lib/umami-analytics'

const DEFAULT_PRESET = 'last-30-days'

export const Route = createFileRoute('/analytics')({
  head: () => ({
    meta: [
      { title: 'Analytics | Government of Barbados' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  loader: () => getAnalytics({ data: DEFAULT_PRESET }),
  component: AnalyticsPage,
})

// --- formatting helpers ---
const fmtInt = (n: number) => n.toLocaleString()
const fmtPct = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}%`
const fmtDur = (s: number | null) =>
  s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`

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

interface SrcPop {
  sources: { referrer: string; count: number }[]
  x: number
  y: number
}

function AnalyticsPage() {
  const initial = Route.useLoaderData()
  const [view, setView] = React.useState<AnalyticsView>(initial)
  const [loadingPreset, setLoadingPreset] = React.useState(false)
  const [activeForm, setActiveForm] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<FormDetailView | null>(null)
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [srcPop, setSrcPop] = React.useState<SrcPop | null>(null)

  async function changePreset(key: string) {
    setLoadingPreset(true)
    setActiveForm(null)
    try {
      setView(await getAnalytics({ data: key }))
    } finally {
      setLoadingPreset(false)
    }
  }

  async function openForm(formId: string) {
    if (activeForm === formId) {
      setActiveForm(null)
      return
    }
    setActiveForm(formId)
    setDetail(null)
    setLoadingDetail(true)
    try {
      setDetail(await getFormDetail({ data: { presetKey: view.presetKey, formId } }))
    } finally {
      setLoadingDetail(false)
    }
  }

  const activeRow = view.forms.find((f) => f.formId === activeForm) ?? null

  return (
    <div className="uar">
      <style>{CSS}</style>
      <div className="uar-head">
        <div className="uar-inner">
          <h1>Umami Analytics</h1>
          <div className="uar-meta">
            Generated {view.generatedAt} · {view.timezone}
          </div>
          <div className="uar-controls">
            <label htmlFor="uar-preset">Date range</label>
            <select
              id="uar-preset"
              value={view.presetKey}
              disabled={loadingPreset}
              onChange={(e) => changePreset(e.target.value)}
            >
              {view.presets.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            {loadingPreset ? <span className="uar-muted">loading…</span> : null}
          </div>
        </div>
      </div>

      <main className="uar-main">
        <section>
          <h2>
            Top pages
            <button type="button" className="uar-howto-btn" popoverTarget="uar-howto-pages">
              How it works
            </button>
          </h2>
          <div className="uar-scroll">
            <table>
              <thead>
                <tr>
                  <th>Path</th>
                  <th className="num">Pageviews</th>
                  <th className="num">Visitors</th>
                  <th>Top source</th>
                </tr>
              </thead>
              <tbody>
                {view.pages.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="uar-empty">
                      No page data for this range.
                    </td>
                  </tr>
                ) : (
                  view.pages.map((p) => (
                    <tr key={p.path}>
                      <td>{p.path}</td>
                      <td className="num">{fmtInt(p.pageviews)}</td>
                      <td className="num">{fmtInt(p.visitors)}</td>
                      <SourceCell sources={p.topSources} onShow={setSrcPop} />
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>
            Top forms
            <button type="button" className="uar-howto-btn" popoverTarget="uar-howto-forms">
              How it works
            </button>
          </h2>
          <div className="uar-scroll">
            <table>
              <thead>
                <tr>
                  <th>Form</th>
                  <th className="num">Starts</th>
                  <th className="num">Completion</th>
                </tr>
              </thead>
              <tbody>
                {view.forms.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="uar-empty">
                      No form data for this range.
                    </td>
                  </tr>
                ) : (
                  view.forms.map((f) => (
                    <tr
                      key={f.formId}
                      className={`uar-form-row${activeForm === f.formId ? ' active' : ''}`}
                      onClick={() => openForm(f.formId)}
                    >
                      <td>
                        {f.title}
                        <div className="uar-cat">{f.category}</div>
                      </td>
                      <td className="num">{fmtInt(f.starts)}</td>
                      <td className="num">{fmtPct(f.completionPct)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>
            Search queries
            <button type="button" className="uar-howto-btn" popoverTarget="uar-howto-search">
              How it works
            </button>
          </h2>
          <SearchSection view={view} />
        </section>
      </main>

      {activeForm ? (
        <>
          <div className="uar-overlay" onClick={() => setActiveForm(null)} />
          <aside className="uar-drawer">
            <button className="uar-close" onClick={() => setActiveForm(null)}>
              Close ✕
            </button>
            <h3>{activeRow?.title ?? activeForm}</h3>
            <div className="uar-sub">
              {activeForm} · {activeRow?.category}
            </div>
            {loadingDetail || !detail ? (
              <p className="uar-muted">Loading details…</p>
            ) : (
              <FormDetailBody row={activeRow} detail={detail} />
            )}
          </aside>
        </>
      ) : null}

      {srcPop ? (
        <div className="uar-srcpop" style={{ left: srcPop.x, top: srcPop.y }}>
          <div className="uar-srctitle">All sources</div>
          {srcPop.sources.map((s) => (
            <div key={s.referrer} className="uar-srcrow">
              <span>{s.referrer}</span>
              <span className="uar-muted">{fmtInt(s.count)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <HowToPopovers />
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
  if (!sources.length) return <td className="uar-muted">—</td>
  const top = sources[0]
  const hasMore = sources.length > 1
  return (
    <td
      className="uar-src"
      style={hasMore ? { cursor: 'help' } : undefined}
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
      {top.referrer} <span className="uar-muted">({fmtInt(top.count)})</span>
      {hasMore ? <span className="uar-muted"> +{sources.length - 1}</span> : null}
    </td>
  )
}

function FormDetailBody({
  row,
  detail,
}: {
  row: AnalyticsView['forms'][number] | null
  detail: FormDetailView
}) {
  const d = detail.detail
  const max = Math.max(1, ...d.funnel.map((s) => s.count))
  const starts = row?.starts ?? 0
  const ofStarts = (n: number) => (starts ? fmtPct(Math.round((n / starts) * 1000) / 10) : '—')
  const totalReasons = d.errorTypes.reduce((a, t) => a + t.count, 0)
  return (
    <>
      <div className="uar-stats">
        <div>
          Starts<b>{fmtInt(starts)}</b>
        </div>
        <div>
          Completed
          <b>
            {fmtInt(row?.completes ?? 0)}{' '}
            <span className="uar-muted">({fmtPct(row?.completionPct ?? 0)})</span>
          </b>
        </div>
        <div>
          Avg time to complete<b>{fmtDur(detail.avgDurationSeconds)}</b>
        </div>
        <div>
          Field errors / start<b>{detail.avgFieldErrors}</b>
        </div>
        <div>
          Total field errors<b>{fmtInt(detail.totalFieldErrors)}</b>
        </div>
      </div>
      <div className="uar-friction">
        <div>
          Step back<b>{fmtInt(d.stepBack)}</b>
        </div>
        <div>
          Step edit<b>{fmtInt(d.stepEdit)}</b>
        </div>
        <div>
          Reviewed<b>{fmtInt(d.review)}</b>
        </div>
      </div>

      <h4>Funnel</h4>
      <div className="uar-funnel">
        {d.funnel.map((s) => (
          <div className="uar-stage" key={s.label}>
            <span>{s.label}</span>
            <span className="uar-barwrap">
              <span className="uar-bar" style={{ width: `${(100 * s.count) / max}%` }} />
            </span>
            <span className="num">
              {fmtInt(s.count)}
              {s.dropoffPct ? <span className="uar-drop"> -{fmtPct(s.dropoffPct)}</span> : null}
            </span>
          </div>
        ))}
      </div>

      <h4>Field errors — which fields fail and how often</h4>
      {d.fieldErrors.length === 0 ? (
        <div className="uar-empty">No field validation errors recorded.</div>
      ) : (
        <div className="uar-scroll">
          <table className="uar-mini">
            <thead>
              <tr>
                <th>Field</th>
                <th className="num">Errors</th>
                <th className="num">% of starts</th>
              </tr>
            </thead>
            <tbody>
              {d.fieldErrors.map((f) => (
                <tr key={f.field}>
                  <td>{f.field}</td>
                  <td className="num">{fmtInt(f.count)}</td>
                  <td className="num">{ofStarts(f.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4>Why fields fail — validation reasons</h4>
      {d.errorTypes.length === 0 ? (
        <div className="uar-empty">No validation-error reasons recorded.</div>
      ) : (
        <div className="uar-scroll">
          <table className="uar-mini">
            <thead>
              <tr>
                <th>Why it failed</th>
                <th>Reason code</th>
                <th className="num">Occurrences</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {d.errorTypes.map((t) => (
                <tr key={t.field}>
                  <td>{reasonLabel(t.field)}</td>
                  <td>
                    <code>{t.field}</code>
                  </td>
                  <td className="num">{fmtInt(t.count)}</td>
                  <td className="num">
                    {fmtPct(totalReasons ? Math.round((t.count / totalReasons) * 1000) / 10 : 0)}
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

function SearchSection({ view }: { view: AnalyticsView }) {
  const s = view.search
  if (!s || (!s.submitTotal && !s.total)) {
    return <div className="uar-empty">No search activity for this range.</div>
  }
  const QueryTable = ({ rows }: { rows: { query: string; count: number }[] }) =>
    rows.length === 0 ? (
      <div className="uar-empty">No queries recorded.</div>
    ) : (
      <div className="uar-scroll">
        <table className="uar-mini">
          <thead>
            <tr>
              <th>Query</th>
              <th className="num">Searches</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.query}>
                <td>{q.query}</td>
                <td className="num">{fmtInt(q.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  return (
    <div className="uar-searchbody">
      <h4>Search submissions (search-submit)</h4>
      <div className="uar-stats">
        <div>
          Search submissions<b>{fmtInt(s.submitTotal)}</b>
        </div>
      </div>
      {s.submitBySource.length ? (
        <>
          <h4>By source</h4>
          <div className="uar-chips">
            {s.submitBySource.map((b) => (
              <span className="uar-chip" key={b.source}>
                {b.source} · {fmtInt(b.count)}
              </span>
            ))}
          </div>
        </>
      ) : null}
      <h4>Top search queries (submitted)</h4>
      <QueryTable rows={s.submitTopQueries} />

      <h4 style={{ marginTop: 22 }}>Results-page searches (search)</h4>
      {s.total ? (
        <>
          <div className="uar-stats">
            <div>
              Searches with results page<b>{fmtInt(s.total)}</b>
            </div>
            <div>
              Returned no results
              <b>
                {fmtInt(s.zeroResults)} <span className="uar-muted">({fmtPct(s.zeroResultsPct)})</span>
              </b>
            </div>
          </div>
          <h4>Top queries (results page)</h4>
          <QueryTable rows={s.topQueries} />
        </>
      ) : (
        <div className="uar-empty">
          No results-page <code>search</code> events in this range (only submissions above).
        </div>
      )}
      <div className="uar-banner">
        Click-through rate is not shown: result clicks are not tracked yet. The no-results rate is the
        closest search-quality signal.
      </div>
    </div>
  )
}

function HowToPopovers() {
  return (
    <>
      <div id="uar-howto-pages" popover="auto" className="uar-howto">
        <h3>Top pages — how it works</h3>
        <p>Most-visited landing pages over the selected range (Umami pageviews), top 10.</p>
        <ul>
          <li>
            <b>Pageviews</b> / <b>Visitors</b> — total loads and unique visitors.
          </li>
          <li>
            <b>Top source</b> — leading referrers to that page; hover to see all. <code>(direct)</code>{' '}
            = no referrer.
          </li>
        </ul>
      </div>
      <div id="uar-howto-forms" popover="auto" className="uar-howto">
        <h3>Top forms — how it works</h3>
        <p>Per form over the range, by starts (top 10). Click a row for the full breakdown.</p>
        <ul>
          <li>
            <b>Starts</b> — visitors who began the form; <b>Completion</b> — successful submits ÷ starts.
          </li>
          <li>
            The drawer adds avg time, field errors per start, the step funnel, the fields that fail most,
            and <em>why</em> they fail.
          </li>
        </ul>
      </div>
      <div id="uar-howto-search" popover="auto" className="uar-howto">
        <h3>Search queries — how it works</h3>
        <ul>
          <li>
            <b>Search submissions</b> (<code>search-submit</code>) — every search-box submission, with top
            queries and a breakdown by where the search ran.
          </li>
          <li>
            <b>Results-page searches</b> (<code>search</code>) — the no-results rate; may be empty when only
            submissions fired.
          </li>
        </ul>
      </div>
    </>
  )
}

const CSS = `
.uar { --teal:#0b6b6b; --teal10:#e6f2f2; --ink:#1a1a1a; --muted:#5a6a6a; --line:#d7e0e0; --warn:#b3541e; color:var(--ink); }
.uar * { box-sizing:border-box; }
.uar-head { background:var(--teal); color:#fff; padding:16px 0; position:sticky; top:0; z-index:30; box-shadow:0 2px 8px rgba(0,0,0,.12); }
.uar-inner { max-width:1100px; margin:0 auto; padding:0 24px; }
.uar-head h1 { margin:0 0 4px; font-size:20px; }
.uar-meta { font-size:13px; opacity:.85; }
.uar-controls { display:flex; align-items:center; gap:10px; margin-top:14px; font-size:13px; }
.uar-controls select { font:inherit; padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,.4); background:#fff; color:var(--ink); }
.uar-main { max-width:1100px; margin:0 auto; padding:24px; }
.uar section { background:#fff; border:1px solid var(--line); border-radius:10px; margin-bottom:24px; overflow:hidden; }
.uar section h2 { margin:0; padding:14px 18px; font-size:16px; border-bottom:1px solid var(--line); background:var(--teal10); display:flex; align-items:center; justify-content:space-between; gap:12px; }
.uar-howto-btn { cursor:pointer; border:1px solid var(--line); background:#fff; color:var(--teal); border-radius:999px; padding:3px 11px; font-size:12px; font-weight:600; }
.uar-scroll { overflow-x:auto; }
.uar table { width:100%; border-collapse:collapse; font-size:14px; }
.uar th, .uar td { text-align:left; padding:10px 14px; border-bottom:1px solid var(--line); white-space:nowrap; }
.uar th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.03em; }
.uar td.num, .uar th.num { text-align:right; font-variant-numeric:tabular-nums; }
.uar-form-row { cursor:pointer; }
.uar-form-row:hover, .uar-form-row.active { background:var(--teal10); }
.uar-cat { color:var(--muted); font-size:12px; }
.uar-empty { padding:18px; color:var(--muted); }
.uar-muted { color:var(--muted); font-weight:400; font-size:13px; }
.uar-searchbody { padding:4px 18px 20px; }
.uar-stats, .uar-friction { display:flex; flex-wrap:wrap; gap:24px; margin:14px 0; font-size:14px; }
.uar-stats b, .uar-friction b { display:block; font-size:18px; }
.uar-stats { padding:12px 14px; background:var(--teal10); border-radius:8px; }
.uar-chips { display:flex; flex-wrap:wrap; gap:8px; }
.uar-chip { background:var(--teal10); border:1px solid var(--line); border-radius:999px; padding:3px 10px; font-size:12px; }
.uar-mini { max-width:600px; }
.uar h4 { margin:16px 0 6px; font-size:13px; color:var(--muted); text-transform:uppercase; letter-spacing:.03em; }
.uar-banner { padding:10px 14px; margin:14px 0 0; background:#fdf3e7; border:1px solid #f0d9bd; border-radius:8px; color:var(--warn); font-size:13px; }
.uar code { background:var(--teal10); padding:1px 5px; border-radius:4px; font-size:12px; }
.uar-funnel { display:flex; flex-direction:column; gap:6px; max-width:560px; }
.uar-stage { display:grid; grid-template-columns:90px 1fr 130px; align-items:center; gap:10px; font-size:13px; }
.uar-bar { display:block; height:22px; background:var(--teal); border-radius:4px; min-width:2px; }
.uar-barwrap { background:var(--teal10); border-radius:4px; }
.uar-drop { color:var(--warn); font-size:12px; }
.uar-overlay { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:40; }
.uar-drawer { position:fixed; top:0; right:0; height:100%; width:min(580px,94vw); background:#fff; box-shadow:-8px 0 28px rgba(0,0,0,.18); z-index:50; overflow-y:auto; padding:20px 22px; }
.uar-drawer h3 { margin:0 8px 4px 0; font-size:18px; }
.uar-sub { color:var(--muted); font-size:13px; margin-bottom:14px; }
.uar-close { float:right; cursor:pointer; border:1px solid var(--line); background:#fff; border-radius:6px; padding:4px 10px; font-size:13px; }
.uar-srcpop { position:fixed; z-index:60; background:#fff; border:1px solid var(--line); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.18); padding:8px 11px; min-width:210px; }
.uar-srctitle { font-size:11px; text-transform:uppercase; letter-spacing:.03em; color:var(--muted); margin-bottom:4px; }
.uar-srcrow { display:flex; justify-content:space-between; gap:20px; padding:3px 0; font-size:13px; }
.uar-howto { max-width:min(460px,92vw); border:1px solid var(--line); border-radius:12px; padding:18px 20px; box-shadow:0 16px 48px rgba(0,0,0,.22); font-size:14px; line-height:1.55; }
.uar-howto h3 { margin:0 0 8px; font-size:15px; }
.uar-howto ul { margin:0; padding-left:18px; }
.uar-howto li { margin:4px 0; }
`
