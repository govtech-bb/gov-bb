// Shared types for the Umami analytics HTML report.
// Stream 3 of docs/superpowers/specs/2026-06-29-umami-analytics-alignment-and-report-design.md

/** A Umami `/metrics` row: `x` is the dimension value, `y` the count. */
export interface MetricRow {
  x: string;
  y: number;
}

/** A Umami `/metrics/expanded` row (type=url). */
export interface ExpandedRow {
  x?: string;
  name?: string;
  pageviews?: number;
  visitors?: number;
  y?: number;
}

/** A Umami `/event-data/values` row for one event + property. */
export interface EventDataValue {
  value: string | number;
  total: number;
}

/** form_id → human title + category slug, resolved from landing content. */
export interface FormMeta {
  title: string;
  category: string;
}

export interface SourceRow {
  referrer: string;
  count: number;
}

export interface PageRow {
  path: string;
  pageviews: number;
  visitors: number;
  /** top referrers driving traffic to this page (descending), empty if none. */
  topSources: SourceRow[];
}

export interface FormRow {
  formId: string;
  title: string;
  category: string;
  starts: number;
  completes: number;
  /** completes / starts * 100, rounded to 1dp; 0 when no starts. */
  completionPct: number;
  /** total validation-error errorCount / starts, rounded to 2dp. */
  avgFieldErrors: number;
  /** weighted avg of form-submit duration_seconds, rounded to whole seconds; null when no completes have a duration. */
  avgDurationSeconds: number | null;
}

export interface FunnelStage {
  label: string;
  count: number;
  /** drop-off from the previous stage, as a percentage (0–100), rounded 1dp; 0 for the first stage. */
  dropoffPct: number;
}

export interface FieldErrorRow {
  field: string;
  count: number;
}

export interface FormDetail {
  formId: string;
  funnel: FunnelStage[];
  stepBack: number;
  stepEdit: number;
  review: number;
  /** fields that fail validation, by descending error count. */
  fieldErrors: FieldErrorRow[];
  /** kinds of validation error (the `errorTypes` messages), by descending count. */
  errorTypes: FieldErrorRow[];
}

export interface SearchQueryRow {
  query: string;
  count: number;
}

export interface SearchSourceRow {
  source: string;
  count: number;
}

export interface SearchReport {
  // --- `search-submit`: every search-box submission (home/services/results) ---
  /** total `search-submit` events in range (incl. empty submissions). */
  submitTotal: number;
  /** top non-empty queries from `search-submit`, by count. */
  submitTopQueries: SearchQueryRow[];
  /** `search-submit` breakdown by where the search ran, by count. */
  submitBySource: SearchSourceRow[];
  // --- `search`: fired on the results page (search-quality / no-results) ---
  /** total `search` events in range. */
  total: number;
  /** searches that returned zero results. */
  zeroResults: number;
  /** zeroResults / total * 100, rounded 1dp; 0 when no searches. */
  zeroResultsPct: number;
  /** top queries by `search` count. */
  topQueries: SearchQueryRow[];
}

export interface PresetReport {
  key: string;
  label: string;
  pages: PageRow[];
  forms: FormRow[];
  details: Record<string, FormDetail>;
  search: SearchReport;
}

export interface ReportModel {
  generatedAt: string;
  timezone: string;
  presets: PresetReport[];
  /**
   * Session-based consolidated report (distinct-session funnels, flow,
   * entry/exit, devices, countries). Optional so an event-only snapshot still
   * validates. See sessions.ts. Freshness (#1917) is `generatedAt` + `sessions.window`.
   */
  sessions?: import("./sessions").SessionReport;
}

/** One requested funnel step (Umami `parameters.steps[]`). */
export interface FunnelStepInput {
  type: "event" | "path";
  value: string;
}

/** One row of the funnel report response. */
export interface FunnelStepResult {
  type: string;
  value: string;
  visitors: number;
  /** absent on the first step */
  dropped?: number;
  /** null on the first step; fraction 0–1 thereafter */
  dropoff: number | null;
}

/** One journey path row. */
export interface JourneyPath {
  items: string[];
  count: number;
}
