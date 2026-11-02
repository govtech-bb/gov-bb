import type {
  ComparisonPeriods,
  StatsPeriod,
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

const num = (n: number) => n.toLocaleString("en-US");
const ratio = (part: number, whole: number) => (whole ? part / whole : null);
const pct = (r: number | null) =>
  r === null ? "–" : `${Math.round(r * 100)}%`;

export function duration(seconds: number | null): string {
  if (seconds === null) return "–";
  const s = Math.round(Math.abs(seconds));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

const arrow = (d: number) => (d > 0 ? "▲" : "▼");

export function countChange(current: number, previous: number): string {
  if (current === previous) return "no change";
  if (!previous) return "new";
  return `${arrow(current - previous)} ${Math.round((Math.abs(current - previous) / previous) * 100)}%`;
}

export function rateChange(current: number | null, previous: number | null) {
  if (current === null || previous === null) return "";
  const pts = Math.round((current - previous) * 100);
  return pts ? `${arrow(pts)} ${Math.abs(pts)} pts` : "no change";
}

export function durationChange(
  current: number | null,
  previous: number | null,
) {
  if (current === null || previous === null) return "";
  const d = Math.round(current - previous);
  return d ? `${arrow(d)} ${duration(d)}` : "no change";
}

/** Rows of `[label, value, change]` as an aligned monospace block. */
function table(rows: string[][]): string {
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((r) => r[i].length)),
  );
  const lines = rows.map((r) =>
    r
      .map((cell, i) =>
        i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]),
      )
      .join("   ")
      .trimEnd(),
  );
  return "```\n" + lines.join("\n") + "\n```";
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

/** e.g. "*Last week* (26 Oct – 1 Nov) compared with 19 Oct – 25 Oct". */
export function periodHeading(
  period: StatsPeriod,
  { current, previous }: ComparisonPeriods,
): string {
  const days = (r: { startAt: number; endAt: number }) =>
    `${dayFmt.format(r.startAt)} – ${dayFmt.format(r.endAt)}`;
  switch (period) {
    case "today":
      return "*Today so far* compared with yesterday";
    case "week":
      return `*Last week* (${days(current)}) compared with ${days(previous)}`;
    case "month":
      return `*${monthFmt.format(current.startAt)}* compared with ${monthFmt.format(previous.startAt)}`;
  }
}

export function formatSiteStats(
  heading: string,
  command: string,
  period: StatsPeriod,
  { current: c, previous: p, biggestDrops }: SiteStats,
): string {
  const visitToStart = [
    ratio(c.starts, c.visitors),
    ratio(p.starts, p.visitors),
  ];
  const startToFinish = [
    ratio(c.completed, c.starts),
    ratio(p.completed, p.starts),
  ];
  const parts = [
    heading,
    table([
      ["Site visitors", num(c.visitors), countChange(c.visitors, p.visitors)],
      [
        "Visit → start form",
        pct(visitToStart[0]),
        rateChange(visitToStart[0], visitToStart[1]),
      ],
      [
        "Start → finish form",
        pct(startToFinish[0]),
        rateChange(startToFinish[0], startToFinish[1]),
      ],
      [
        "Forms finished",
        num(c.completed),
        countChange(c.completed, p.completed),
      ],
      [
        "Avg time to finish",
        duration(c.avgDurationSeconds),
        durationChange(c.avgDurationSeconds, p.avgDurationSeconds),
      ],
    ]),
  ];
  if (biggestDrops.length) {
    parts.push(
      "*Biggest drops in finish rate*",
      table([
        ["Form", "Starts", "Finish", "Change"],
        ...biggestDrops.map((f) => [
          f.formId,
          num(f.starts),
          pct(f.finishRate),
          rateChange(f.finishRate, f.previousFinishRate),
        ]),
      ]),
      `Try \`${command} ${period} ${biggestDrops[0].formId}\` for details.`,
    );
  } else {
    parts.push(
      `No form with at least ${MIN_STARTS_FOR_RANKING} starts lost finish rate.`,
    );
  }
  return parts.join("\n");
}

export function formatFormStats(
  heading: string,
  { title, formId, current: c, previous: p, steps, topErrors }: FormStats,
): string {
  const visitToStart = [ratio(c.starts, c.visits), ratio(p.starts, p.visits)];
  const startToFinish = [
    ratio(c.completed, c.starts),
    ratio(p.completed, p.starts),
  ];
  const parts = [
    `*${title}* (\`${formId}\`)`,
    heading,
    table([
      ["Visitors to form", num(c.visits), countChange(c.visits, p.visits)],
      [
        "Visit → start",
        pct(visitToStart[0]),
        rateChange(visitToStart[0], visitToStart[1]),
      ],
      [
        "Start → finish",
        pct(startToFinish[0]),
        rateChange(startToFinish[0], startToFinish[1]),
      ],
      ["Finished", num(c.completed), countChange(c.completed, p.completed)],
      [
        "Avg time to finish",
        duration(c.avgDurationSeconds),
        durationChange(c.avgDurationSeconds, p.avgDurationSeconds),
      ],
    ]),
  ];
  if (steps.length) {
    parts.push(
      "*Where people leave* (views of each step)",
      table(
        steps.map((s, i) => {
          const before = steps[i - 1]?.count;
          const drop =
            before && s.count < before
              ? `−${Math.round(((before - s.count) / before) * 100)}%`
              : "";
          return [s.title, num(s.count), drop];
        }),
      ),
    );
  }
  if (topErrors.length) {
    parts.push(
      "*Top errors*: " +
        topErrors.map((e) => `${e.label} (${num(e.count)})`).join(" · "),
    );
  }
  return parts.join("\n");
}
