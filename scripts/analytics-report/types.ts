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

export interface PageRow {
  path: string;
  pageviews: number;
  visitors: number;
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
  fieldErrors: FieldErrorRow[];
}

export interface PresetReport {
  key: string;
  label: string;
  pages: PageRow[];
  forms: FormRow[];
  details: Record<string, FormDetail>;
}

export interface ReportModel {
  generatedAt: string;
  timezone: string;
  presets: PresetReport[];
}
