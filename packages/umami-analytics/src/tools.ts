// The interactive tools and the shaping of their traffic and `tool-*` events,
// shared by the analytics dashboard's Tools tab and the Slack /stats command so
// both report the same numbers. Pure: the caller reads the rows from Umami.
import type { ToolId } from "@govtech-bb/analytics";
import type { EventDataValue, ExpandedRow, SourceRow } from "./types";

/**
 * The interactive tools (calculators + finders) surfaced on the analytics
 * "Tools" tab (#2119, #3517). Kept as a single config constant so the tab is
 * extended by adding a row here, not by editing the component/shaper.
 *
 * Each tool spans one or more landing routes:
 * - `id` — the `tool` value the tool sends in its `tool-*` events (ADR 0138),
 *   which the row's event metrics are filtered by.
 * - `prefix` — every landing URL under this prefix rolls up into the tool
 *   (e.g. the shelter finder's `/find` and `/guidance` sub-pages).
 * - `primaryPath` — the tool's canonical entry page; its referrers become the
 *   row's "Top source", and it's the path the row links to.
 * - `noResultOutcome` — the `tool-result` outcome that means the visitor got
 *   nothing (no matches, not eligible). Tools without one show no rate.
 * - `live` — an explicit flag for showing the tool on the tab (all eight are
 *   shown; NIS and pension are still `preview` on landing). Not derived from
 *   `visibility`: the calculators have no `-meta.ts`, so there's no single
 *   visibility source across the set. Deriving it is a follow-up once every
 *   tool carries metadata.
 */
export interface Tool {
  id: ToolId;
  name: string;
  prefix: string;
  primaryPath: string;
  noResultOutcome?: string;
  live: boolean;
}

export const TOOLS: Tool[] = [
  {
    id: "severance-calculator",
    name: "Find out how much severance you are owed",
    prefix: "/money-financial-support/calculate-severance-pay",
    primaryPath: "/money-financial-support/calculate-severance-pay",
    noResultOutcome: "not-eligible",
    live: true,
  },
  {
    id: "crop-over-permits",
    name: "Find the permits you need for a Crop Over event",
    prefix: "/business-trade/crop-over-permits",
    primaryPath: "/business-trade/crop-over-permits",
    live: true,
  },
  {
    id: "shelter-finder",
    name: "Find an emergency shelter",
    prefix: "/health-and-emergency-services/find-an-emergency-shelter",
    primaryPath: "/health-and-emergency-services/find-an-emergency-shelter",
    noResultOutcome: "no-results",
    live: true,
  },
  {
    id: "bank-holidays",
    name: "Check bank holiday dates",
    prefix: "/bank-holiday-calendar",
    primaryPath: "/bank-holiday-calendar",
    live: true,
  },
  // No route at the prefix itself: its start page is the markdown content
  // page, and `/find` plus each pharmacy's `/$slug` page sit under it.
  {
    id: "pharmacy-finder",
    name: "Find an open pharmacy",
    prefix: "/health-and-emergency-services/find-an-open-pharmacy",
    primaryPath: "/health-and-emergency-services/find-an-open-pharmacy",
    noResultOutcome: "no-results",
    live: true,
  },
  {
    id: "water-outages",
    name: "Check for water outages in your area",
    prefix: "/health-and-emergency-services/water-outages",
    primaryPath: "/health-and-emergency-services/water-outages",
    live: true,
  },
  {
    id: "nis-self-employed",
    name: "Learn how to pay National Insurance when you work for yourself",
    prefix:
      "/money-financial-support/national-insurance-for-self-employed-workers",
    primaryPath:
      "/money-financial-support/national-insurance-for-self-employed-workers",
    live: true,
  },
  {
    id: "pension-calculator",
    name: "Calculate your Government pension",
    prefix: "/pensions-and-gratuities/calculate-your-pension",
    primaryPath: "/pensions-and-gratuities/calculate-your-pension",
    live: true,
  },
];

/** The live tools, in declared order — the set the Tools tab renders. */
export const liveTools = (): Tool[] => TOOLS.filter((t) => t.live);

/**
 * Does a landing URL path belong to a tool's route prefix? Exact match or a
 * `/`-boundary descendant — so `/bank-holiday-calendar` never swallows a
 * same-stemmed sibling like `/bank-holiday-calendar-archive`.
 */
export function pathMatchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** One interactive tool's traffic on the "Tools" tab. */
export interface ToolRow {
  name: string;
  /** the tool's canonical entry path (the row links here). */
  path: string;
  pageviews: number;
  /**
   * Distinct visitors, SUMMED across the tool's sub-pages. Exact for
   * single-page tools; may overcount a visitor who hits several sub-pages of a
   * multi-page tool — surfaced with a caveat in the UI. True prefix-distinct isn't available from Umami's per-path metrics.
   */
  visitors: number;
  topSources: SourceRow[];
  /**
   * The tool's own events (ADR 0138). Null when it sent no `tool-result`,
   * `tool-action` or `tool-error` in the window — the "no tool events" state,
   * which every tool shows until it is instrumented.
   */
  events: ToolEventStats | null;
}

/** What visitors got from a tool and did with it, from its `tool-*` events. */
export interface ToolEventStats {
  /** `tool-result` events. */
  results: number;
  /**
   * Share of results with the tool's `noResultOutcome` (no matches, not
   * eligible), 0–1. Null when the tool has no such outcome or no results.
   */
  noResultRate: number | null;
  /** The most-sent `tool-action`; null when there were none. */
  topAction: { action: string; count: number } | null;
  /** `tool-error` events. */
  errors: number;
  /** errors ÷ (results + errors), 0–1, like a form's submit error rate. */
  errorRate: number | null;
}

/** The water outage alert sign-up funnel, as the water tool sends it (#3510). */
export interface WaterAlertFunnel {
  /** `tool-action` `subscribe-submit`. */
  submitted: number;
  /** `tool-result` `subscribe-sent`: the confirmation email went out. */
  sent: number;
  /** `tool-result` `confirmed` (sent only at step `confirm`). */
  confirmed: number;
  /** `tool-result` `unsubscribed` (sent only at step `unsubscribe`). */
  unsubscribed: number;
}

/** The tool-event value rows read from Umami for the Tools tab. */
export interface ToolEventRows {
  /** The `tool` values of each event: its count per tool, for every tool. */
  resultsByTool: EventDataValue[];
  actionsByTool: EventDataValue[];
  errorsByTool: EventDataValue[];
  /** Per tool, the `outcome` values of its `tool-result` events. */
  outcomes: Map<ToolId, EventDataValue[]>;
  /** Per tool, the `action` values of its `tool-action` events. */
  actions: Map<ToolId, EventDataValue[]>;
}

/** The summed count of the rows whose value is `value`. */
export function totalFor(rows: EventDataValue[], value: string): number {
  return rows
    .filter((r) => String(r.value) === value)
    .reduce((s, r) => s + r.total, 0);
}

/**
 * A tool's own outcome or action rows, or undefined when they can't be
 * trusted: the query failed (no entry), or the rows add up to more than the
 * tool's own count, as they would if Umami ignored the `tool` filter. The
 * table then shows a dash rather than a wrong number.
 */
function breakdownFor(
  rows: Map<ToolId, EventDataValue[]>,
  tool: Tool,
  count: number,
): EventDataValue[] | undefined {
  const own = rows.get(tool.id);
  return own && own.reduce((s, r) => s + r.total, 0) <= count ? own : undefined;
}

/**
 * One tool's event metrics, or null when it sent no tool events (the empty
 * state). Counts come from the every-tool `tool` values; the no-result rate and
 * top action from the tool's own outcome and action values.
 */
export function shapeToolEvents(
  tool: Tool,
  rows: ToolEventRows,
): ToolEventStats | null {
  const results = totalFor(rows.resultsByTool, tool.id);
  const actionCount = totalFor(rows.actionsByTool, tool.id);
  const errors = totalFor(rows.errorsByTool, tool.id);
  if (results + actionCount + errors === 0) return null;
  const outcomes = breakdownFor(rows.outcomes, tool, results);
  const top = breakdownFor(rows.actions, tool, actionCount)?.reduce<
    EventDataValue | undefined
  >((best, r) => (!best || r.total > best.total ? r : best), undefined);
  return {
    results,
    noResultRate:
      tool.noResultOutcome && outcomes && results
        ? totalFor(outcomes, tool.noResultOutcome) / results
        : null,
    topAction: top ? { action: String(top.value), count: top.total } : null,
    errors,
    errorRate: results + errors ? errors / (results + errors) : null,
  };
}

/**
 * The alert sign-up funnel from the water tool's outcome and action values.
 * Each outcome is sent at one step only, so the outcome alone tells a confirm
 * or unsubscribe result apart. Null when a breakdown query failed (no entry
 * although the tool sent that event), so the page says so instead of showing
 * zeros that read as "no emails went out".
 */
export function shapeWaterAlerts(rows: ToolEventRows): WaterAlertFunnel | null {
  const id: ToolId = "water-outages";
  const outcomes = rows.outcomes.get(id);
  const actions = rows.actions.get(id);
  if (
    (!outcomes && totalFor(rows.resultsByTool, id) > 0) ||
    (!actions && totalFor(rows.actionsByTool, id) > 0)
  ) {
    return null;
  }
  return {
    submitted: totalFor(actions ?? [], "subscribe-submit"),
    sent: totalFor(outcomes ?? [], "subscribe-sent"),
    confirmed: totalFor(outcomes ?? [], "confirmed"),
    unsubscribed: totalFor(outcomes ?? [], "unsubscribed"),
  };
}

/**
 * Roll landing URL rows up into one row per tool: sum pageviews + visitors for
 * every URL under the tool's route prefix, attach the tool's entry-path
 * referrers as its top source, and its event metrics. Pure — the caller
 * supplies the URL rows, a `primaryPath → referrers` map and the tool-event
 * rows, so it's fully unit-testable. Every tool is returned (zeroes when it has
 * no traffic) so owners always see it listed.
 */
export function shapeTools(
  tools: Tool[],
  urlRows: ExpandedRow[],
  sourcesByPath: Map<string, SourceRow[]>,
  eventRows: ToolEventRows,
): ToolRow[] {
  return tools.map((tool) => {
    let pageviews = 0;
    let visitors = 0;
    for (const row of urlRows) {
      const path = row.x ?? row.name ?? "";
      if (!pathMatchesPrefix(path, tool.prefix)) continue;
      pageviews += row.pageviews ?? row.y ?? 0;
      visitors += row.visitors ?? 0;
    }
    return {
      name: tool.name,
      path: tool.primaryPath,
      pageviews,
      visitors,
      topSources: sourcesByPath.get(tool.primaryPath) ?? [],
      events: shapeToolEvents(tool, eventRows),
    };
  });
}
