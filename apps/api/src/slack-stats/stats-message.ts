import type {
  ComparisonPeriods,
  EventDataValue,
  StatsPeriod,
  Tool,
  ToolEventStats,
  WaterAlertFunnel,
} from "@govtech-bb/umami-analytics";

const TZ = "America/Barbados";

/** Site-wide numbers for one period. Starts/completions are summed per form. */
export interface SitePeriod {
  visitors: number;
  starts: number;
  completed: number;
  avgDurationSeconds: number | null;
}

export interface FormFinishChange {
  formId: string;
  starts: number;
  /** 0–1 */
  finishRate: number;
  /** 0–1 */
  previousFinishRate: number;
}

export interface SiteStats {
  current: SitePeriod;
  previous: SitePeriod;
  biggestDrops: FormFinishChange[];
}

/** One form's headline numbers for one period. */
export interface FormPeriod {
  visits: number;
  starts: number;
  completed: number;
  avgDurationSeconds: number | null;
}

export interface FormStats {
  formId: string;
  title: string;
  current: FormPeriod;
  previous: FormPeriod;
  /** views of each step, in the form's step order (event counts, so a revisit counts again). */
  steps: { title: string; count: number }[];
  topErrors: { label: string; count: number }[];
}

/** Forms with fewer starts than this are too noisy to rank by finish rate. */
export const MIN_STARTS_FOR_RANKING = 20;

/**
 * The (up to) 3 forms whose finish rate fell the most, ignoring forms with
 * fewer than MIN_STARTS_FOR_RANKING starts in either period.
 */
export function biggestFinishDrops(
  forms: {
    formId: string;
    current: { starts: number; completed: number };
    previous: { starts: number; completed: number };
  }[],
): FormFinishChange[] {
  return forms
    .filter(
      (f) =>
        f.current.starts >= MIN_STARTS_FOR_RANKING &&
        f.previous.starts >= MIN_STARTS_FOR_RANKING,
    )
    .map((f) => ({
      formId: f.formId,
      starts: f.current.starts,
      finishRate: f.current.completed / f.current.starts,
      previousFinishRate: f.previous.completed / f.previous.starts,
    }))
    .filter((f) => f.finishRate < f.previousFinishRate)
    .sort(
      (a, b) =>
        a.finishRate -
        a.previousFinishRate -
        (b.finishRate - b.previousFinishRate),
    )
    .slice(0, 3);
}

// --- formatting ------------------------------------------------------------

/** A Slack message: `text` is the notification fallback, `blocks` the layout. */
export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

type Better = "up" | "down";

const num = (n: number) => n.toLocaleString("en-US");
const ratio = (part: number, whole: number) => (whole ? part / whole : null);
const pct = (r: number | null) =>
  r === null ? "–" : `${Math.round(r * 100)}%`;

/** "45s", "6m 40s", "3h 34m". */
export function duration(seconds: number | null): string {
  if (seconds === null) return "–";
  const s = Math.round(Math.abs(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

/** 🟢 when the change goes the `better` way, 🔴 when it doesn't. */
function trend(delta: number, better: Better, label: string): string {
  const good = better === "up" ? delta > 0 : delta < 0;
  return `${good ? "🟢" : "🔴"} ${delta > 0 ? "▲" : "▼"} ${label}`;
}

export function countChange(
  current: number,
  previous: number,
  better: Better = "up",
): string {
  if (current === previous) return "⚪ no change";
  if (!previous) return better === "up" ? "🆕 new" : "🔴 new";
  const change = Math.round((Math.abs(current - previous) / previous) * 100);
  return trend(current - previous, better, `${change}%`);
}

export function rateChange(
  current: number | null,
  previous: number | null,
  better: Better = "up",
) {
  if (current === null || previous === null) return "";
  const pts = Math.round((current - previous) * 100);
  return pts ? trend(pts, better, `${Math.abs(pts)} pts`) : "⚪ no change";
}

/** Shorter is better, so a longer time is 🔴. */
export function durationChange(
  current: number | null,
  previous: number | null,
) {
  if (current === null || previous === null) return "";
  const d = Math.round(current - previous);
  return d ? trend(d, "down", duration(d)) : "⚪ no change";
}

const dayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
});
const monthFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  month: "long",
  year: "numeric",
});

/** What a period is called, and what it is compared with. */
export interface PeriodHeading {
  /** e.g. "Last week" */
  title: string;
  /** e.g. "26 Oct – 1 Nov, compared with 19 Oct – 25 Oct" */
  detail: string;
}

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

export function periodHeading(
  period: StatsPeriod,
  { current, previous }: ComparisonPeriods,
): PeriodHeading {
  // Format a point well inside the first and last day, so the label never
  // depends on which side of midnight a range boundary falls.
  const days = (r: { startAt: number; endAt: number }) =>
    `${dayFmt.format(r.startAt + HALF_DAY_MS)} – ${dayFmt.format(r.endAt - HALF_DAY_MS)}`;
  switch (period) {
    case "today":
      return { title: "Today so far", detail: "Compared with yesterday" };
    case "week":
      return {
        title: "Last week",
        detail: `${days(current)}, compared with ${days(previous)}`,
      };
    case "month":
      return {
        title: monthFmt.format(current.startAt + HALF_DAY_MS),
        detail: `Compared with ${monthFmt.format(previous.startAt + HALF_DAY_MS)}`,
      };
  }
}

// Block Kit building blocks.
const header = (text: string) => ({
  type: "header",
  text: { type: "plain_text", text, emoji: true },
});
const context = (text: string) => ({
  type: "context",
  elements: [{ type: "mrkdwn", text }],
});
const section = (text: string) => ({
  type: "section",
  text: { type: "mrkdwn", text },
});
const divider = { type: "divider" };

/** A two-column grid of metric cards: label, value and change. */
function metrics(rows: [string, string, string][]) {
  return {
    type: "section",
    fields: rows.map(([label, value, change]) => ({
      type: "mrkdwn",
      text: `*${label}*\n*${value}*   ${change}`.trimEnd(),
    })),
  };
}

const BAR_WIDTH = 12;
const STEP_TITLE_MAX = 34;

/** Step views as a monospace bar chart, scaled to the busiest step. */
export function stepBars(steps: { title: string; count: number }[]): string {
  const max = Math.max(1, ...steps.map((s) => s.count));
  const titles = steps.map((s) =>
    s.title.length > STEP_TITLE_MAX
      ? s.title.slice(0, STEP_TITLE_MAX - 1) + "…"
      : s.title,
  );
  const width = Math.max(...titles.map((t) => t.length));
  const countWidth = num(max).length;
  const lines = steps.map((s, i) => {
    const filled = Math.round((s.count / max) * BAR_WIDTH);
    const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
    return `${titles[i].padEnd(width)}  ${bar}  ${num(s.count).padStart(countWidth)}`;
  });
  return "```\n" + lines.join("\n") + "\n```";
}

export function formatSiteStats(
  heading: PeriodHeading,
  command: string,
  period: StatsPeriod,
  { current: c, previous: p, biggestDrops }: SiteStats,
): SlackMessage {
  const visitToStart = [
    ratio(c.starts, c.visitors),
    ratio(p.starts, p.visitors),
  ];
  const startToFinish = [
    ratio(c.completed, c.starts),
    ratio(p.completed, p.starts),
  ];
  const blocks: unknown[] = [
    header(`📊 Site and forms · ${heading.title}`),
    context(heading.detail),
    metrics([
      [
        "👥 Site visitors",
        num(c.visitors),
        countChange(c.visitors, p.visitors),
      ],
      [
        "🚪 Visit → start form",
        pct(visitToStart[0]),
        rateChange(visitToStart[0], visitToStart[1]),
      ],
      [
        "🏁 Start → finish form",
        pct(startToFinish[0]),
        rateChange(startToFinish[0], startToFinish[1]),
      ],
      [
        "📨 Forms finished",
        num(c.completed),
        countChange(c.completed, p.completed),
      ],
      [
        "⏱️ Avg time to finish",
        duration(c.avgDurationSeconds),
        durationChange(c.avgDurationSeconds, p.avgDurationSeconds),
      ],
    ]),
    divider,
  ];
  if (biggestDrops.length) {
    blocks.push(
      section(
        "*📉 Biggest drops in finish rate*\n" +
          biggestDrops
            .map(
              (f) =>
                `• \`${f.formId}\`: ${num(f.starts)} starts, *${pct(f.finishRate)}* finish   ${rateChange(f.finishRate, f.previousFinishRate)}`,
            )
            .join("\n"),
      ),
      context(
        `💡 For one form, try \`${command} ${period} ${biggestDrops[0].formId}\``,
      ),
    );
  } else {
    blocks.push(
      context(
        `✅ No form with at least ${MIN_STARTS_FOR_RANKING} starts lost finish rate.`,
      ),
    );
  }
  return {
    text: `📊 ${heading.title}: ${num(c.visitors)} visitors, ${num(c.completed)} forms finished`,
    blocks,
  };
}

export function formatFormStats(
  heading: PeriodHeading,
  { title, formId, current: c, previous: p, steps, topErrors }: FormStats,
): SlackMessage {
  // Starts and visits come from different funnels, so a start with no page
  // view in the period (a deep link) can push this past 100%. Cap it as the
  // dashboard does (visitsToStartsPct in apps/analytics umami-server.ts).
  const visitToStart = [
    ratio(c.starts, c.visits),
    ratio(p.starts, p.visits),
  ].map((r) => (r === null ? r : Math.min(1, r)));
  const startToFinish = [
    ratio(c.completed, c.starts),
    ratio(p.completed, p.starts),
  ];
  const blocks: unknown[] = [
    header(`📝 ${title}`),
    context(`\`${formId}\` · *${heading.title}* · ${heading.detail}`),
    metrics([
      ["👥 Visitors to form", num(c.visits), countChange(c.visits, p.visits)],
      [
        "🚪 Visit → start",
        pct(visitToStart[0]),
        rateChange(visitToStart[0], visitToStart[1]),
      ],
      [
        "🏁 Start → finish",
        pct(startToFinish[0]),
        rateChange(startToFinish[0], startToFinish[1]),
      ],
      ["📨 Finished", num(c.completed), countChange(c.completed, p.completed)],
      [
        "⏱️ Avg time to finish",
        duration(c.avgDurationSeconds),
        durationChange(c.avgDurationSeconds, p.avgDurationSeconds),
      ],
    ]),
  ];
  if (steps.length) {
    blocks.push(
      divider,
      section("*🚶 Where people leave*\n" + stepBars(steps)),
      context(
        "Views of each step. Steps that only some people see have fewer views.",
      ),
    );
  }
  if (topErrors.length) {
    blocks.push(
      divider,
      section(
        "*🚨 Top errors*\n" +
          topErrors.map((e) => `• ${e.label}: *${num(e.count)}*`).join("\n"),
      ),
    );
  }
  return {
    text: `📝 ${title} · ${heading.title}: ${num(c.starts)} started, ${num(c.completed)} finished`,
    blocks,
  };
}

/** One tool's numbers for one period, from its landing pages and `tool-*` events. */
export interface ToolPeriod {
  /** Summed across the tool's pages, as on the dashboard's Tools tab. */
  visitors: number;
  /** From `tool-result`, `tool-action` and `tool-error`; null when it sent none. */
  events: ToolEventStats | null;
  /** `tool-step-view` events. */
  stepViews: number;
  /**
   * Counts by step, action and error code: empty when there were none,
   * undefined when Umami's breakdown could not be read or trusted.
   */
  steps: EventDataValue[] | undefined;
  actions: EventDataValue[] | undefined;
  errors: EventDataValue[] | undefined;
  /** Water outages only: the alert sign-ups, null when they could not be read. */
  waterAlerts?: WaterAlertFunnel | null;
}

export interface ToolStats {
  tool: Tool;
  current: ToolPeriod;
  previous: ToolPeriod;
}

/**
 * A step, action or error code as the tools send them (ADR 0138). Anyone can
 * send Umami an event, so a value of another shape is counted but never put
 * into the message, where it could mention, link or format.
 */
const TOOL_CODE = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const STEPS_SHOWN = 10;
const TOP_SHOWN = 3;

/** Each code's count in both periods, busiest now first; odd values merge into "other". */
function compareCodes(
  current: EventDataValue[],
  previous: EventDataValue[] = [],
) {
  const counts = new Map<string, { now: number; before: number }>();
  const add = (rows: EventDataValue[], key: "now" | "before") => {
    for (const r of rows) {
      const value = String(r.value);
      const label = TOOL_CODE.test(value) ? `\`${value}\`` : "other";
      const c = counts.get(label) ?? { now: 0, before: 0 };
      c[key] += r.total;
      counts.set(label, c);
    }
  };
  add(current, "now");
  add(previous, "before");
  return [...counts]
    .map(([label, c]) => ({ label, ...c }))
    .sort((a, b) => b.now - a.now || b.before - a.before);
}

/** One period's codes as a list with their change, or a note when Umami's breakdown is missing. */
function codeList(
  title: string,
  current: EventDataValue[] | undefined,
  previous: EventDataValue[] | undefined,
  { shown, better = "up" }: { shown: number; better?: Better },
) {
  const lines = current
    ? compareCodes(current, previous)
        .filter((r) => r.now > 0 || shown === STEPS_SHOWN)
        .slice(0, shown)
        .map(
          (r) =>
            `• ${r.label}: *${num(r.now)}*   ${countChange(r.now, r.before, better)}`,
        )
    : ["Couldn't read the breakdown from Umami."];
  return section(`*${title}*\n` + lines.join("\n"));
}

/** "not-eligible" → "Not eligible". */
const outcomeLabel = (outcome: string) =>
  outcome.charAt(0).toUpperCase() + outcome.slice(1).replace(/-/g, " ");

export function formatToolStats(
  heading: PeriodHeading,
  { tool, current: c, previous: p }: ToolStats,
): SlackMessage {
  const blocks: unknown[] = [
    header(`🧰 ${tool.name}`),
    context(`\`${tool.id}\` · *${heading.title}* · ${heading.detail}`),
  ];
  const visitors: [string, string, string] = [
    "👥 Visitors to the tool",
    num(c.visitors),
    countChange(c.visitors, p.visitors),
  ];
  const caveat = context(
    "Visitors are summed across the tool's pages, so someone who views more than one page may be counted more than once.",
  );
  if (!c.events && !c.stepViews) {
    blocks.push(
      metrics([visitors]),
      section("💤 No tool events yet in this period."),
      caveat,
    );
    return {
      text: `🧰 ${tool.name} · ${heading.title}: ${num(c.visitors)} visitors, no tool events yet`,
      blocks,
    };
  }

  const results = c.events?.results ?? 0;
  const errors = c.events?.errors ?? 0;
  const rows: [string, string, string][] = [
    visitors,
    ["👣 Step views", num(c.stepViews), countChange(c.stepViews, p.stepViews)],
    ["✅ Results", num(results), countChange(results, p.events?.results ?? 0)],
  ];
  if (tool.noResultOutcome) {
    const now = c.events?.noResultRate ?? null;
    rows.push([
      `🚫 ${outcomeLabel(tool.noResultOutcome)}`,
      pct(now),
      rateChange(now, p.events?.noResultRate ?? null, "down"),
    ]);
  }
  rows.push([
    "⚠️ Errors",
    num(errors),
    countChange(errors, p.events?.errors ?? 0, "down"),
  ]);
  blocks.push(metrics(rows), divider);

  if (c.stepViews) {
    blocks.push(
      codeList("👣 Views of each step", c.steps, p.steps, {
        shown: STEPS_SHOWN,
      }),
    );
  }
  if (c.actions?.length !== 0) {
    blocks.push(
      codeList("👆 Top actions", c.actions, p.actions, { shown: TOP_SHOWN }),
    );
  }
  if (errors) {
    blocks.push(
      codeList("🚨 Top errors", c.errors, p.errors, {
        shown: TOP_SHOWN,
        better: "down",
      }),
    );
  }
  if (c.waterAlerts !== undefined) {
    const w = c.waterAlerts;
    const before = p.waterAlerts;
    // No change shown against a period whose sign-ups couldn't be read.
    const change = (key: keyof WaterAlertFunnel, better?: Better) =>
      w && before ? countChange(w[key], before[key], better) : "";
    blocks.push(
      divider,
      section("*🔔 Outage alert sign-ups*"),
      w
        ? metrics([
            ["✍️ Submitted", num(w.submitted), change("submitted")],
            ["📧 Emails sent", num(w.sent), change("sent")],
            ["✅ Confirmed", num(w.confirmed), change("confirmed")],
            [
              "👋 Unsubscribed",
              num(w.unsubscribed),
              change("unsubscribed", "down"),
            ],
          ])
        : context("Couldn't read the sign-ups from Umami."),
    );
  }
  blocks.push(caveat);
  return {
    text: `🧰 ${tool.name} · ${heading.title}: ${num(c.visitors)} visitors, ${num(results)} results`,
    blocks,
  };
}
