import {
  canonicalEvent,
  eventFormKey,
  isSubmitErrorCode,
  MIN_QUERY_COUNT,
  parseEventName,
  type ComparisonPeriods,
  type EventDataValue,
  type MetricRow,
  type JourneyRow,
  type SearchStats,
  type StatsPeriod,
  type Tool,
  type ToolEventStats,
  type ToolRow,
  type WaterAlertFunnel,
} from "@govtech-bb/umami-analytics";
import { mrkdwnEscape } from "@/notifications/slack-notifier.service";

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

/**
 * The (up to) 3 commonest errors on one form. Field IDs and error codes come
 * from Umami event data, which anyone can send, so only a field in
 * `labelByField` (the form's own fields) or a known code is named. Every other
 * value counts in an "other fields" or "submit failed: other" row. Rows are
 * kept apart by field ID, so two fields with the same label stay two rows.
 */
export function tallyTopErrors(
  fieldErrors: { field: string; count: number }[],
  submitErrors: EventDataValue[],
  labelByField: Map<string, string>,
): { label: string; count: number }[] {
  const rows = new Map<string, { label: string; count: number }>();
  const add = (key: string, label: string, count: number) => {
    const row = rows.get(key) ?? { label, count: 0 };
    row.count += count;
    rows.set(key, row);
  };
  for (const f of fieldErrors) {
    const label = labelByField.get(f.field);
    if (label) add(`field:${f.field}`, label, f.count);
    else add("other fields", "other fields", f.count);
  }
  for (const r of submitErrors) {
    const code = String(r.value);
    const label = `submit failed: ${isSubmitErrorCode(code) ? code : "other"}`;
    add(label, label, r.total);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count).slice(0, 3);
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

/**
 * Step views as a monospace bar chart, scaled to the busiest step. A code
 * block shows `*`, `_` and `~` as typed, so titles only lose backticks (which
 * could end the block) and are escaped after padding, so the bars line up.
 */
export function stepBars(steps: { title: string; count: number }[]): string {
  const max = Math.max(1, ...steps.map((s) => s.count));
  const titles = steps.map((s) => {
    const title = s.title.replace(/`/g, "");
    return title.length > STEP_TITLE_MAX
      ? title.slice(0, STEP_TITLE_MAX - 1) + "…"
      : title;
  });
  const width = Math.max(...titles.map((t) => t.length));
  const countWidth = num(max).length;
  const lines = steps.map((s, i) => {
    const filled = Math.round((s.count / max) * BAR_WIDTH);
    const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
    return `${mrkdwnEscape(titles[i].padEnd(width))}  ${bar}  ${num(s.count).padStart(countWidth)}`;
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
          topErrors
            .map((e) => `• ${plainSlackText(e.label)}: *${num(e.count)}*`)
            .join("\n"),
        true,
      ),
    );
  }
  return {
    text: `📝 ${mrkdwnEscape(title)} · ${heading.title}: ${num(c.starts)} started, ${num(c.completed)} finished`,
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
 * Characters that show nothing: bidi controls (U+061C, U+200E-U+200F,
 * U+202A-U+202E, U+2066-U+2069), zero-width characters (U+200B-U+200D, U+2060,
 * U+FEFF), and others such as tag characters and the soft hyphen. They can
 * reverse or hide part of a line, so it looks like something it isn't.
 */
const HIDDEN_CHARS = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * Event data as inert Slack text. Anyone can send events to Umami, so a value
 * must not mention, link, format or hide text: characters that reverse or hide
 * text are removed, Slack's control characters escaped, formatting marks and
 * line breaks removed, and long text shortened.
 */
export function plainSlackText(value: string): string {
  // Array.from splits by code point, so shortening never cuts an emoji.
  const chars = Array.from(
    value
      .replace(HIDDEN_CHARS, "")
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
 * A search query as plainSlackText. maskSearchQuery hides the middle of a long
 * number with `*`, which plainSlackText would remove (`1****6` would show as
 * `16`), so each `*` becomes ∗, which looks the same but isn't bold.
 */
export const slackQuery = (query: string) =>
  plainSlackText(query.replace(/\*/g, "∗"));

/**
 * The busiest queries, without empty labels. A query seen fewer than
 * MIN_QUERY_COUNT times is dropped first, so one-off variants of a name
 * (`jane_doe`, `janedoe`) can't add up to the minimum. Then the rest are
 * grouped on the cleaned label so look-alikes (`pass_port`, `passport`) merge.
 */
function topQueries(rows: { query: string; count: number }[]) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.count < MIN_QUERY_COUNT) continue;
    const label = slackQuery(r.query);
    if (label) counts.set(label, (counts.get(label) ?? 0) + r.count);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
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

const STEPS_SHOWN = 10;
const TOP_SHOWN = 3;

/**
 * Each code's count in both periods, busiest now first. Codes come from Umami
 * event data, which anyone can send, so each goes through plainSlackText.
 */
function compareCodes(
  current: EventDataValue[],
  previous: EventDataValue[] = [],
) {
  const counts = new Map<string, { now: number; before: number }>();
  const add = (rows: EventDataValue[], key: "now" | "before") => {
    for (const r of rows) {
      const label = `\`${plainSlackText(String(r.value))}\``;
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
  {
    shown,
    better = "up",
    keepGone = false,
  }: { shown: number; better?: Better; keepGone?: boolean },
) {
  const lines = current
    ? compareCodes(current, previous)
        .filter((r) => r.now > 0 || keepGone)
        .slice(0, shown)
        .map((r) =>
          // No change shown against a period whose breakdown couldn't be read.
          `• ${r.label}: *${num(r.now)}*   ${previous ? countChange(r.now, r.before, better) : ""}`.trimEnd(),
        )
    : ["Couldn't read the breakdown from Umami."];
  return section(`*${title}*\n` + lines.join("\n"), true);
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
      section(
        `💤 No tool events yet in this period. The period before: ${num(p.events?.results ?? 0)} results, ${num(p.stepViews)} step views.`,
      ),
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
        keepGone: true,
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

/** One tool's numbers for one period in the all-tools reply, from shapeTools. */
export type ToolTotals = Pick<ToolRow, "visitors" | "events">;

export interface ToolsSummary {
  tools: { tool: Tool; current: ToolTotals; previous: ToolTotals }[];
}

/** A 0–1 rate to one decimal place, as the dashboard's Tools tab shows it. */
const toolRate = (r: number | null) =>
  r === null ? "–" : `${(r * 100).toFixed(1).replace(/\.0$/, "")}%`;

/**
 * Every tool on one line (#3807): the dashboard Tools tab's visitors, results,
 * no-result rate and errors, each with the change from the period before.
 */
export function formatToolsSummary(
  heading: PeriodHeading,
  { tools }: ToolsSummary,
): SlackMessage {
  const lines = tools.map(({ tool, current: c, previous: p }) => {
    const figures = [
      `👥 *${num(c.visitors)}* visitors ${countChange(c.visitors, p.visitors)}`,
    ];
    const e = c.events;
    if (!e) {
      // A tool that stopped sending events must not read as not set up yet.
      figures.push(
        p.events
          ? "💤 no tool events this period (it sent some the period before)"
          : "💤 no tool events yet",
      );
    } else {
      figures.push(
        `✅ *${num(e.results)}* results ${countChange(e.results, p.events?.results ?? 0)}`,
      );
      if (tool.noResultOutcome) {
        figures.push(
          `🚫 *${toolRate(e.noResultRate)}* ${outcomeLabel(tool.noResultOutcome).toLowerCase()} ${rateChange(e.noResultRate, p.events?.noResultRate ?? null, "down")}`.trimEnd(),
        );
      }
      const errorRate =
        e.errorRate === null ? "" : ` (${toolRate(e.errorRate)})`;
      figures.push(
        `⚠️ *${num(e.errors)}* errors${errorRate} ${countChange(e.errors, p.events?.errors ?? 0, "down")}`,
      );
    }
    return section(`*${tool.name}* (\`${tool.id}\`): ${figures.join(" · ")}`);
  });
  const visitors = tools.reduce((n, t) => n + t.current.visitors, 0);
  const results = tools.reduce(
    (n, t) => n + (t.current.events?.results ?? 0),
    0,
  );
  return {
    text: `🧰 Tools · ${heading.title}: ${num(visitors)} visitors, ${num(results)} results`,
    blocks: [
      header(`🧰 Tools · ${heading.title}`),
      context(heading.detail),
      ...lines,
      context(
        "Visitors are summed across each tool's pages, so someone who views more than one page may be counted more than once. The no-result rate is the share of results where the visitor found nothing or was not eligible; tools without such a result have no rate. The error rate in brackets is errors ÷ (results + errors).",
      ),
    ],
  };
}

/** Counts of the landing → forms hand-off events for one period (#3808). */
export type HandOffCounts = Record<
  "page-service-view" | "page-start-view" | "start-click" | "form-start",
  number
>;

/**
 * Sum the hand-off events from each website's event list. Events sent with a
 * `form` are stored packed as `<form>:<event>`, sometimes with a short code
 * (`psvw`, `fstrt`), so each name is unpacked and canonicalised before it is
 * matched. `form-start` is a forms event; the rest are landing events.
 */
export function countHandOffs(
  landing: MetricRow[],
  forms: MetricRow[],
): HandOffCounts {
  const total = (rows: MetricRow[], event: string) =>
    rows.reduce(
      (n, r) =>
        canonicalEvent(parseEventName(r.x)?.event ?? r.x) === event
          ? n + r.y
          : n,
      0,
    );
  return {
    "page-service-view": total(landing, "page-service-view"),
    "page-start-view": total(landing, "page-start-view"),
    "start-click": total(landing, "start-click"),
    "form-start": total(forms, "form-start"),
  };
}

export interface JourneyStats {
  /** The paths from shapeJourneyList (the dashboard's journey table), busiest first. */
  paths: Pick<JourneyRow, "items" | "sessions" | "share">[];
  current: HandOffCounts;
  previous: HandOffCounts;
}

/**
 * A journey step as inert Slack text. Steps come from page paths anyone can
 * send to Umami. Page slugs never hold &, < or >, so they are dropped rather
 * than escaped: escaping can make a step five times longer, and a section
 * over Slack's 3,000-character limit makes Slack refuse the whole reply.
 */
const journeyStep = (label: string) =>
  plainSlackText(label.replace(/[&<>]/g, ""));

/** Five journeys of up to 4 steps of 80 characters stay under Slack's limit. */
const JOURNEYS_SHOWN = 5;

/** A share as the dashboard shows it: one decimal, no trailing ".0". */
const share = (r: number) => `${(r * 100).toFixed(1).replace(/\.0$/, "")}%`;

export function formatJourneyStats(
  heading: PeriodHeading,
  { paths, current: c, previous: p }: JourneyStats,
): SlackMessage {
  const blocks: unknown[] = [
    header(`🧭 Landing journeys · ${heading.title}`),
    context(heading.detail),
    section(
      paths.length
        ? "*🛤️ Most common journeys on landing*\n" +
            paths
              .slice(0, JOURNEYS_SHOWN)
              .map(
                (j) =>
                  `• ${j.items.map(journeyStep).join(" → ")}: *${share(j.share)}* (${num(j.sessions)})`,
              )
              .join("\n")
        : "💤 No journeys of two or more pages on landing in this period.",
      true,
    ),
    divider,
    section("*🔀 From landing to forms*"),
    metrics(
      (
        [
          ["📄 Service page views", "page-service-view"],
          ["🚪 Start page views", "page-start-view"],
          ["👆 Start now clicks", "start-click"],
          ["📝 Forms started", "form-start"],
        ] as const
      ).map(([label, key]): [string, string, string] => [
        label,
        num(c[key]),
        countChange(c[key], p[key]),
      ]),
    ),
    context(
      "ℹ️ These are event counts. Landing and forms are separate Umami websites, so they are four separate counts, not a funnel. The full journey from landing to forms is only in `/journey` in Datadog.",
    ),
  ];
  return {
    text: `🧭 Landing journeys · ${heading.title}: ${num(c["page-service-view"])} service page views, ${num(c["form-start"])} forms started`,
    blocks,
  };
}
