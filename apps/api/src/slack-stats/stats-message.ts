import {
  canonicalEvent,
  eventFormKey,
  parseEventName,
  type ComparisonPeriods,
  type EventDataValue,
  type MetricRow,
  type SearchStats,
  type StatsPeriod,
} from "@govtech-bb/umami-analytics";

const TZ = "America/Barbados";

/** Site-wide numbers for one period. Starts/completions are summed per form. */
export interface SitePeriod {
  visitors: number;
  starts: number;
  completed: number;
  avgDurationSeconds: number | null;
  deadEnds: DeadEnds;
  /** The known form with the most closed views and load errors. */
  topDeadEndForm: { formId: string; count: number } | null;
}

/** Times a citizen was stopped before reaching a service, in one period. */
export interface DeadEnds {
  formClosed: number;
  formLoadError: number;
  serviceUnavailable: number;
  pageNotFound: number;
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

const FORM_DEAD_ENDS = new Map<string, keyof DeadEnds>([
  ["form-closed-view", "formClosed"],
  ["form-load-error", "formLoadError"],
]);

/**
 * Dead-end counts for one period from the `metricsEvents` rows of both
 * websites, and the form with the most. With a `form`, the forms site stores
 * `<form>:<event>`, maybe with a short event code or a hashed form key, so
 * names go through canonicalEvent, and a key maps back to its form ID through
 * `formIds`. A key that matches no known form counts in the totals but is
 * never named: anyone can send Umami an event name, and a form ID typed into
 * the forms address reaches it too, so it must not reach Slack.
 */
export function tallyDeadEnds(
  landing: MetricRow[],
  forms: MetricRow[],
  formIds: string[],
): { deadEnds: DeadEnds; topForm: { formId: string; count: number } | null } {
  const deadEnds: DeadEnds = {
    formClosed: 0,
    formLoadError: 0,
    serviceUnavailable: 0,
    pageNotFound: 0,
  };
  for (const { x, y } of landing) {
    if (x === "service-unavailable-view") deadEnds.serviceUnavailable += y;
    if (x === "page-not-found") deadEnds.pageNotFound += y;
  }
  const idByKey = new Map(formIds.map((id) => [eventFormKey(id), id]));
  const byForm = new Map<string, number>();
  for (const { x, y } of forms) {
    // A form-load-error with no form (not found) is stored unpacked.
    const packed = parseEventName(x);
    const key = FORM_DEAD_ENDS.get(canonicalEvent(packed ? packed.event : x));
    if (!key) continue;
    deadEnds[key] += y;
    const formId = packed && idByKey.get(packed.formId);
    if (formId) byForm.set(formId, (byForm.get(formId) ?? 0) + y);
  }
  let topForm: { formId: string; count: number } | null = null;
  for (const [formId, count] of byForm) {
    if (!topForm || count > topForm.count) topForm = { formId, count };
  }
  return { deadEnds, topForm };
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
/** `verbatim` stops Slack linking bare URLs and #channels: for event data. */
const section = (text: string, verbatim = false) => ({
  type: "section",
  text: { type: "mrkdwn", text, ...(verbatim && { verbatim }) },
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
  ];
  const deadEnds = (
    [
      ["closed form", "formClosed"],
      ["form didn't load", "formLoadError"],
      ["service unavailable", "serviceUnavailable"],
      ["page not found", "pageNotFound"],
    ] as const
  ).map(([label, key]) => ({
    label,
    now: c.deadEnds[key],
    before: p.deadEnds[key],
  }));
  if (deadEnds.some((d) => d.now || d.before)) {
    blocks.push(
      section(
        "*🚧 Dead ends:* " +
          deadEnds
            .map(
              (d) =>
                `${d.label} *${num(d.now)}* ${countChange(d.now, d.before, "down")}`,
            )
            .join(" · ") +
          (c.topDeadEndForm
            ? ` · most on \`${c.topDeadEndForm.formId}\` (${num(c.topDeadEndForm.count)})`
            : ""),
      ),
    );
  }
  blocks.push(divider);
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

/** How often one value of a chat event's property was seen. */
export interface ChatCount {
  label: string;
  count: number;
}

/** One period of the landing chat events (#3810). */
export interface ChatPeriod {
  /** `chat-submit` counts by `source` (where on landing it was asked). */
  bySource: ChatCount[];
  /** `chat-suggestion` counts by `question` (the suggestion picked). */
  suggestions: ChatCount[];
}

export interface ChatStats {
  current: ChatPeriod;
  previous: ChatPeriod;
}

const CHAT_SOURCES_SHOWN = 5;
const CHAT_SUGGESTIONS_SHOWN = 3;
const CHAT_LABEL_MAX = 80;

/**
 * Event data as inert Slack text. Anyone can send events to Umami, so a value
 * must not mention, link or format: Slack's control characters are escaped,
 * formatting marks and line breaks removed, and long text shortened.
 */
export function plainSlackText(value: string): string {
  // Array.from splits by code point, so shortening never cuts an emoji.
  const chars = Array.from(
    value
      .replace(/[*_~`]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  const short =
    chars.length > CHAT_LABEL_MAX
      ? chars.slice(0, CHAT_LABEL_MAX - 1).join("") + "…"
      : chars.join("");
  return short
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const total = (rows: ChatCount[]) => rows.reduce((s, r) => s + r.count, 0);

/**
 * Every label in either period, as plainSlackText, busiest now first, with
 * both counts. Grouping on the cleaned label merges look-alikes ("home ").
 */
function compareCounts(current: ChatCount[], previous: ChatCount[]) {
  const counts = new Map<string, { now: number; before: number }>();
  const add = (rows: ChatCount[], key: "now" | "before") => {
    for (const r of rows) {
      const label = plainSlackText(r.label);
      const c = counts.get(label) ?? { now: 0, before: 0 };
      c[key] += r.count;
      counts.set(label, c);
    }
  };
  add(current, "now");
  add(previous, "before");
  return [...counts]
    .map(([label, c]) => ({ label, ...c }))
    .sort((a, b) => b.now - a.now || b.before - a.before);
}

export function formatChatStats(
  heading: PeriodHeading,
  { current: c, previous: p }: ChatStats,
): SlackMessage {
  const asked = total(c.bySource);
  const picked = total(c.suggestions);
  const blocks: unknown[] = [
    header(`💬 Chat on landing · ${heading.title}`),
    context(heading.detail),
  ];
  if (!asked && !picked) {
    blocks.push(
      section(
        `💤 Nobody asked a chat question or picked a suggested question. The period before: ${num(total(p.bySource))} asked, ${num(total(p.suggestions))} picked.`,
      ),
    );
  } else {
    blocks.push(
      metrics([
        [
          "💬 Questions asked",
          num(asked),
          countChange(asked, total(p.bySource)),
        ],
        [
          "👆 Suggestions picked",
          num(picked),
          countChange(picked, total(p.suggestions)),
        ],
      ]),
      divider,
    );
    const sources = compareCounts(c.bySource, p.bySource);
    if (asked) {
      const shown = sources.slice(0, CHAT_SOURCES_SHOWN);
      const others = sources
        .slice(CHAT_SOURCES_SHOWN)
        .reduce((n, s) => n + s.now, 0);
      const lines = shown.map(
        (s) =>
          `• \`${s.label}\`: *${num(s.now)}*   ${countChange(s.now, s.before)}`,
      );
      if (others) lines.push(`• other places: *${num(others)}*`);
      blocks.push(
        section(
          "*📍 Questions asked, by where on landing*\n" + lines.join("\n"),
          true,
        ),
      );
    }
    const top = compareCounts(c.suggestions, p.suggestions)
      .filter((s) => s.now > 0)
      .slice(0, CHAT_SUGGESTIONS_SHOWN);
    if (top.length) {
      blocks.push(
        section(
          "*⭐ Top suggested questions picked*\n" +
            top
              .map(
                (s) =>
                  `• ${s.label}: *${num(s.now)}*   ${countChange(s.now, s.before)}`,
              )
              .join("\n"),
          true,
        ),
      );
    }
  }
  blocks.push(
    context(
      "ℹ️ Answer outcomes (answered, error, stopped) are not included yet.",
    ),
  );
  return {
    text: `💬 Chat on landing · ${heading.title}: ${num(asked)} questions asked, ${num(picked)} suggestions picked`,
    blocks,
  };
}

/** Landing search for a period and the one before, from shapeSearch (#3809). */
export interface SearchReport {
  current: SearchStats;
  previous: SearchStats;
  /** this period's `search-no-results` rows: query, and searches that found nothing. */
  noResults: EventDataValue[];
}

const QUERIES_SHOWN = 5;
/**
 * A query seen fewer times than this could be one person's text, such as a
 * name, which maskSearchQuery can't mask (ADR 0111), so it isn't shown.
 */
export const MIN_QUERY_COUNT = 3;

/**
 * A search query as plainSlackText. maskSearchQuery hides the middle of a long
 * number with `*`, which plainSlackText would remove (`1****6` would show as
 * `16`), so each `*` becomes ∗, which looks the same but isn't bold.
 */
export const slackQuery = (query: string) =>
  plainSlackText(query.replace(/\*/g, "∗"));

/**
 * The busiest queries, grouped on the cleaned label so look-alikes
 * (`pass_port`, `passport`) merge, without empty labels or any query seen
 * fewer than MIN_QUERY_COUNT times.
 */
function topQueries(rows: { query: string; count: number }[]) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const label = slackQuery(r.query);
    if (label) counts.set(label, (counts.get(label) ?? 0) + r.count);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .filter((q) => q.count >= MIN_QUERY_COUNT)
    .sort((a, b) => b.count - a.count)
    .slice(0, QUERIES_SHOWN);
}

export function formatSearchStats(
  heading: PeriodHeading,
  { current: c, previous: p, noResults }: SearchReport,
): SlackMessage {
  const noResultRate = [c, p].map((s) =>
    s.searches ? s.zeroResultRate : null,
  );
  const queries = topQueries(
    c.queries.map((q) => ({ query: q.query, count: q.searches })),
  );
  const nothing = topQueries(
    noResults.map((r) => ({ query: String(r.value), count: r.total })),
  );
  const list = (title: string, rows: typeof queries) =>
    section(
      `*${title}*\n` +
        rows.map((q) => `• ${q.label}: *${num(q.count)}*`).join("\n"),
      true,
    );
  const blocks: unknown[] = [
    header(`🔎 Search · ${heading.title}`),
    context(heading.detail),
    metrics([
      ["🔎 Searches", num(c.searches), countChange(c.searches, p.searches)],
      [
        "🚫 No results",
        pct(noResultRate[0]),
        rateChange(noResultRate[0], noResultRate[1], "down"),
      ],
      ["👆 Result clicks", num(c.clicks), countChange(c.clicks, p.clicks)],
    ]),
  ];
  if (!c.searches) {
    blocks.push(context("No searches in this period."));
  } else if (!queries.length && !nothing.length) {
    blocks.push(
      context(`No query was searched ${MIN_QUERY_COUNT} or more times.`),
    );
  } else {
    blocks.push(divider);
    if (queries.length) blocks.push(list("🔝 Top searches", queries));
    if (nothing.length) {
      blocks.push(list("🤷 Top searches that found nothing", nothing));
    }
    blocks.push(
      context(
        `Numbers are searches for each query. Queries searched fewer than ${MIN_QUERY_COUNT} times are not shown.`,
      ),
    );
  }
  return {
    text: `🔎 ${heading.title}: ${num(c.searches)} searches, ${num(c.clicks)} result clicks`,
    blocks,
  };
}
