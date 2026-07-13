import { Heading, Text } from '@govtech-bb/react'
import type { FlowData, FlowLink } from './lib/umami-server'

// Hand-rolled layered Sankey. A fixed shallow depth (the journey report's first
// few steps) means we don't need a general Sankey solver: bars per column sized
// by throughput, bezier ribbons sized by visit count. One teal hue (+ a green
// accent for "Start") keeps it on-brand and CVD-safe — no rainbow.

const NODE_W = 12
const COL_STEP = 300
const H = 520
const GAP = 14
const LABEL_PAD = 220 // room to the right of the last column for its labels

const fmtInt = (n: number) => n.toLocaleString()
const fmtPct = (frac: number) => `${Math.round(frac * 100)}%`

interface LaidNode {
  id: string
  column: number
  label: string
  value: number
  pct: number
  x: number
  y: number
  h: number
}

function isStart(label: string) {
  return label === 'Start'
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const it of items) {
    const k = key(it)
    const list = m.get(k)
    if (list) list.push(it)
    else m.set(k, [it])
  }
  return m
}

function layout(flow: FlowData) {
  const columns = flow.nodes.reduce((m, n) => Math.max(m, n.column), 0) + 1
  const byCol: (typeof flow.nodes)[] = Array.from({ length: columns }, () => [])
  for (const n of flow.nodes) byCol[n.column]?.push(n)
  byCol.forEach((list) => {
    list.sort((a, b) => b.value - a.value)
  })

  const colTotal = byCol.map((list) => list.reduce((s, n) => s + n.value, 0))
  const maxTotal = Math.max(1, ...colTotal)
  const maxCount = Math.max(1, ...byCol.map((l) => l.length))
  const unit = (H - GAP * (maxCount - 1)) / maxTotal

  const pos = new Map<string, LaidNode>()
  byCol.forEach((list, c) => {
    const stackH =
      (colTotal[c] ?? 0) * unit + GAP * Math.max(0, list.length - 1)
    let y = (H - stackH) / 2
    for (const n of list) {
      const h = Math.max(3, n.value * unit)
      pos.set(n.id, { ...n, x: c * COL_STEP, y, h })
      y += h + GAP
    }
  })

  // Ribbon offsets: source side ordered by target position, target side by
  // source position, so ribbons entering/leaving a node don't cross needlessly.
  const yOf = (id: string) => pos.get(id)?.y ?? 0
  const outByNode = groupBy(flow.links, (l) => l.source)
  const inByNode = groupBy(flow.links, (l) => l.target)
  for (const [, ls] of outByNode) ls.sort((a, b) => yOf(a.target) - yOf(b.target))
  for (const [, ls] of inByNode) ls.sort((a, b) => yOf(a.source) - yOf(b.source))

  const linkSy = new Map<FlowLink, number>()
  const linkTy = new Map<FlowLink, number>()
  for (const [src, ls] of outByNode) {
    let off = yOf(src)
    for (const l of ls) {
      linkSy.set(l, off)
      off += Math.max(1, l.value * unit)
    }
  }
  for (const [tgt, ls] of inByNode) {
    let off = yOf(tgt)
    for (const l of ls) {
      linkTy.set(l, off)
      off += Math.max(1, l.value * unit)
    }
  }

  const ribbons = flow.links
    .map((l) => {
      const s = pos.get(l.source)
      const t = pos.get(l.target)
      if (!s || !t) return null
      const h = Math.max(1, l.value * unit)
      const sy = linkSy.get(l) ?? s.y
      const ty = linkTy.get(l) ?? t.y
      const x0 = s.x + NODE_W
      const x1 = t.x
      const xm = (x0 + x1) / 2
      const d = `M${x0},${sy} C${xm},${sy} ${xm},${ty} ${x1},${ty} L${x1},${ty + h} C${xm},${ty + h} ${xm},${sy + h} ${x0},${sy + h} Z`
      return {
        key: `${l.source}~${l.target}`,
        d,
        source: s.label,
        target: t.label,
        value: l.value,
        // share of the source node's visitors that took this step
        pctOfSource: s.value ? l.value / s.value : 0,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const width = (columns - 1) * COL_STEP + NODE_W + LABEL_PAD
  return { laidNodes: [...pos.values()], ribbons, width, height: H }
}

export function FlowDiagram({ flow }: { flow: FlowData }) {
  const { laidNodes, ribbons, width, height } = layout(flow)
  return (
    <section className="mb-l">
      <FlowHeader />
      {laidNodes.length === 0 ? (
        <Text as="p" size="caption" className="text-mid-grey-00">
          Not enough multi-step visits in this range to draw a flow.
        </Text>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-grey-00 p-s">
          <style>{FLOW_CSS}</style>
          <svg
            className="uar-flow"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Visitor flow through the first few steps of a visit"
          >
            <g fill="var(--color-teal-00)">
              {ribbons.map((r) => (
                <path key={r.key} d={r.d} className="uar-ribbon">
                  <title>
                    {r.source} → {r.target} — {fmtInt(r.value)} visits (
                    {fmtPct(r.pctOfSource)} of {r.source})
                  </title>
                </path>
              ))}
            </g>
            {laidNodes.map((n) => (
              <g key={n.id}>
                <rect
                  x={n.x}
                  y={n.y}
                  width={NODE_W}
                  height={n.h}
                  rx={2}
                  fill={
                    isStart(n.label)
                      ? 'var(--color-green-00)'
                      : 'var(--color-teal-00)'
                  }
                >
                  <title>
                    {n.label} — {fmtInt(n.value)} visits ({fmtPct(n.pct)} of
                    entries)
                  </title>
                </rect>
                <text
                  x={n.x + NODE_W + 6}
                  y={n.y + n.h / 2}
                  dominantBaseline="central"
                  fontSize={12}
                  fill="currentColor"
                >
                  {n.label}
                  <tspan className="uar-pct"> {fmtPct(n.pct)}</tspan>
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}
      <Text as="p" size="small-caption" className="mt-xs text-mid-grey-00">
        Column 1 is the entry page; each column is the next step. Percentages are
        each node’s share of all entry visits; ribbon width = number of visits
        (hover for the share of the previous step). Low-traffic steps in a column
        are grouped as “Other (N)”.
      </Text>
    </section>
  )
}

function FlowHeader() {
  return (
    <div className="mb-s flex items-center justify-between gap-s">
      <Heading as="h2" size="h3">
        The flow
      </Heading>
      <Text as="span" size="small-caption" className="text-mid-grey-00">
        first few steps — width = number of visits
      </Text>
    </div>
  )
}

const FLOW_CSS = `
.uar-flow .uar-ribbon { fill-opacity: .28; transition: fill-opacity .15s; }
.uar-flow .uar-ribbon:hover { fill-opacity: .6; }
.uar-flow .uar-pct { fill: var(--color-mid-grey-00); font-weight: 700; }
`
