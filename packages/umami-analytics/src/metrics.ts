// Pure aggregation for the Umami analytics report. No I/O — every function
// takes raw Umami response data and returns a view model, so it is unit-tested
// against fixtures with no network.
import type {
  EventDataValue,
  ExpandedRow,
  FieldErrorRow,
  FieldFailureTally,
  FormDetail,
  FormMeta,
  FormRow,
  FunnelStage,
  MetricRow,
  PageRow,
  SearchReport,
  SourceRow,
} from "./types";

const NUMBER_WORDS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

/** Reverse of stepNumberToWord: "one" → 1, "three" → 3, else null. */
function stepWordToNumber(word: string): number | null {
  const i = NUMBER_WORDS.indexOf(word as (typeof NUMBER_WORDS)[number]);
  return i === -1 ? null : i + 1;
}

/**
 * Split a prefixed event name into its form id and base event.
 * Aligned events are `<form_id>:<event>` (form ids are kebab-case, no colons),
 * so we split on the first colon. Returns null for unprefixed events.
 */
export function parseEventName(
  name: string,
): { formId: string; event: string } | null {
  const i = name.indexOf(":");
  if (i <= 0 || i === name.length - 1) return null;
  return { formId: name.slice(0, i), event: name.slice(i + 1) };
}

export interface FormEventAgg {
  /** base event name → total count (e.g. "form-start" → 120). */
  counts: Record<string, number>;
  /** per-step completion counts, indexed by 1-based step number. */
  steps: { step: number; count: number }[];
}

/** Group `/metrics?type=event` rows (forms site) by form id. */
export function aggregateFormEvents(
  rows: MetricRow[],
): Map<string, FormEventAgg> {
  const out = new Map<string, FormEventAgg>();
  for (const row of rows) {
    const parsed = parseEventName(row.x);
    if (!parsed) continue;
    const entry = out.get(parsed.formId) ?? { counts: {}, steps: [] };
    const stepWord = parsed.event.startsWith("form-step-")
      ? parsed.event.slice("form-step-".length)
      : null;
    const stepNum = stepWord ? stepWordToNumber(stepWord) : null;
    if (stepNum !== null) {
      entry.steps.push({ step: stepNum, count: row.y });
    } else {
      entry.counts[parsed.event] = (entry.counts[parsed.event] ?? 0) + row.y;
    }
    out.set(parsed.formId, entry);
  }
  for (const entry of out.values()) {
    entry.steps.sort((a, b) => a.step - b.step);
  }
  return out;
}

/** Σ(value × total) / Σ(total). Returns null when there are no observations. */
export function weightedAverage(values: EventDataValue[]): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const { value, total } of values) {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(n)) continue;
    weightedSum += n * total;
    totalWeight += total;
  }
  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

/** Σ(value × total) — total of a numeric property across all observations. */
export function weightedSum(values: EventDataValue[]): number {
  let sum = 0;
  for (const { value, total } of values) {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(n)) continue;
    sum += n * total;
  }
  return sum;
}

/**
 * Tally individual fields from `form-validation-error` `fields` values, which
 * are comma-joined field-id lists. Returns fields sorted by descending count.
 */
export function tallyFields(values: EventDataValue[]): FieldErrorRow[] {
  const counts = new Map<string, number>();
  for (const { value, total } of values) {
    const list = String(value)
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
    for (const field of list) {
      counts.set(field, (counts.get(field) ?? 0) + total);
    }
  }
  return [...counts.entries()]
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Parse the `form-validation-error` `fieldErrors` values — each a
 * `field:code[|code];field:code…` string (see the forms app's
 * buildValidationErrorPayload) — into per-field failure tallies. A field's
 * `count` is how many error events it appeared in; each reason's `count` is how
 * many events it failed on that reason. Both are weighted by the event `total`.
 * Fields and reasons come back sorted by descending count, so `[0]` is the most
 * problematic field. The delimiters can't collide: field ids are kebab-case and
 * codes are a closed enum, so neither contains `;`, `:` or `|`.
 */
export function tallyFieldErrors(
  values: EventDataValue[],
): FieldFailureTally[] {
  const fields = new Map<
    string,
    { count: number; reasons: Map<string, number> }
  >();
  for (const { value, total } of values) {
    for (const pair of String(value).split(";")) {
      const entry = pair.trim();
      if (!entry) continue;
      const sep = entry.indexOf(":");
      if (sep <= 0) continue;
      const field = entry.slice(0, sep);
      const codes = entry
        .slice(sep + 1)
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (codes.length === 0) continue;
      const rec = fields.get(field) ?? { count: 0, reasons: new Map() };
      rec.count += total;
      for (const code of codes) {
        rec.reasons.set(code, (rec.reasons.get(code) ?? 0) + total);
      }
      fields.set(field, rec);
    }
  }
  return [...fields.entries()]
    .map(([field, rec]) => ({
      field,
      count: rec.count,
      reasons: [...rec.reasons.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Top pages by pageviews, from `/metrics/expanded?type=url` (landing site). */
export function buildPageRows(rows: ExpandedRow[], topN: number): PageRow[] {
  return rows
    .map((r) => ({
      path: r.x ?? r.name ?? "(unknown)",
      pageviews: r.pageviews ?? r.y ?? 0,
      visitors: r.visitors ?? 0,
      topSources: [] as SourceRow[],
    }))
    .sort((a, b) => b.pageviews - a.pageviews)
    .slice(0, topN);
}

/**
 * Top referrers for a page, from `/metrics?type=referrer&path=…`. An empty
 * referrer (`x`) is direct traffic. Already descending; just normalise + slice.
 */
export function buildSources(rows: MetricRow[], topN: number): SourceRow[] {
  return rows
    .map((r) => ({ referrer: r.x?.trim() ? r.x : "(direct)", count: r.y }))
    .slice(0, topN);
}

export interface FormDetailSource {
  duration: EventDataValue[];
  errorCount: EventDataValue[];
  fields: EventDataValue[];
  errorTypes: EventDataValue[];
}

/**
 * Build the top-form summary rows. `details` holds the per-form event-data
 * pulls (only fetched for the forms that make the table). Sorted by starts.
 */
export function buildFormRows(
  agg: Map<string, FormEventAgg>,
  meta: Map<string, FormMeta>,
  details: Map<string, FormDetailSource>,
  topN: number,
): FormRow[] {
  const rows: FormRow[] = [];
  for (const [formId, entry] of agg.entries()) {
    const starts = entry.counts["form-start"] ?? 0;
    const completes = entry.counts["form-submit"] ?? 0;
    const detail = details.get(formId);
    const totalFieldErrors = detail ? weightedSum(detail.errorCount) : 0;
    const avgDuration = detail ? weightedAverage(detail.duration) : null;
    const m = meta.get(formId);
    rows.push({
      formId,
      title: m?.title ?? formId,
      category: m?.category ?? "uncategorised",
      starts,
      completes,
      completionPct: starts === 0 ? 0 : round((completes / starts) * 100, 1),
      avgFieldErrors: starts === 0 ? 0 : round(totalFieldErrors / starts, 2),
      avgDurationSeconds: avgDuration === null ? null : Math.round(avgDuration),
    });
  }
  return rows.sort((a, b) => b.starts - a.starts).slice(0, topN);
}

/** Build the drop-off funnel: start → each completed step → submit. */
export function buildFunnel(entry: FormEventAgg): FunnelStage[] {
  const stages: { label: string; count: number }[] = [
    { label: "Start", count: entry.counts["form-start"] ?? 0 },
    ...entry.steps.map((s) => ({ label: `Step ${s.step}`, count: s.count })),
    { label: "Submit", count: entry.counts["form-submit"] ?? 0 },
  ];
  return stages.map((stage, i) => {
    const prev = i === 0 ? stage.count : stages[i - 1].count;
    const dropoffPct =
      i === 0 || prev === 0 ? 0 : round(((prev - stage.count) / prev) * 100, 1);
    return { ...stage, dropoffPct };
  });
}

/** Assemble the per-form drill-down detail. */
export function buildFormDetail(
  formId: string,
  entry: FormEventAgg,
  source: FormDetailSource | undefined,
): FormDetail {
  return {
    formId,
    funnel: buildFunnel(entry),
    stepBack: entry.counts["form-step-back"] ?? 0,
    stepEdit: entry.counts["form-step-edit"] ?? 0,
    review: entry.counts["form-review"] ?? 0,
    fieldErrors: source ? tallyFields(source.fields) : [],
    errorTypes: source ? tallyFields(source.errorTypes) : [],
  };
}

function topNonEmptyQueries(
  values: EventDataValue[],
  topN: number,
): { query: string; count: number }[] {
  return values
    .filter((v) => String(v.value).trim() !== "")
    .map((v) => ({ query: String(v.value), count: v.total }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

/**
 * Summarise landing search from two events:
 *  - `search-submit` (every search-box submission): query frequency + a
 *    breakdown by where the search ran (home/services/results). This is the
 *    primary "what are people searching" signal and is always populated.
 *  - `search` (fired on the results page): the zero-results rate. May be empty
 *    in ranges where only `search-submit` is firing.
 * CTR is not derivable (no search-result click event).
 */
export function buildSearchReport(
  queryValues: EventDataValue[],
  resultsValues: EventDataValue[],
  submitQueryValues: EventDataValue[],
  submitSourceValues: EventDataValue[],
  topN: number,
): SearchReport {
  let total = 0;
  let zeroResults = 0;
  for (const { value, total: t } of resultsValues) {
    total += t;
    if (Number(value) === 0) zeroResults += t;
  }
  const submitBySource = submitSourceValues
    .map((v) => ({ source: String(v.value), count: v.total }))
    .sort((a, b) => b.count - a.count);
  const submitTotal = submitBySource.reduce((acc, s) => acc + s.count, 0);
  return {
    submitTotal,
    submitTopQueries: topNonEmptyQueries(submitQueryValues, topN),
    submitBySource,
    total,
    zeroResults,
    zeroResultsPct: total === 0 ? 0 : round((zeroResults / total) * 100, 1),
    topQueries: topNonEmptyQueries(queryValues, topN),
  };
}
