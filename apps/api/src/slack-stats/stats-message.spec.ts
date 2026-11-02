import { comparisonPeriods } from "@govtech-bb/umami-analytics";
import {
  biggestFinishDrops,
  countChange,
  duration,
  durationChange,
  formatFormStats,
  formatSiteStats,
  periodHeading,
  rateChange,
} from "./stats-message";

const NOW = new Date("2026-11-04T18:30:00Z");

describe("change helpers", () => {
  it("counts change in percent", () => {
    expect(countChange(108, 100)).toBe("▲ 8%");
    expect(countChange(90, 100)).toBe("▼ 10%");
    expect(countChange(5, 5)).toBe("no change");
    expect(countChange(5, 0)).toBe("new");
  });

  it("rates change in percentage points", () => {
    expect(rateChange(0.64, 0.59)).toBe("▲ 5 pts");
    expect(rateChange(0.31, 0.33)).toBe("▼ 2 pts");
    expect(rateChange(0.5, 0.5)).toBe("no change");
    expect(rateChange(null, 0.5)).toBe("");
  });

  it("formats durations and their change", () => {
    expect(duration(400)).toBe("6m 40s");
    expect(duration(45)).toBe("45s");
    expect(duration(null)).toBe("–");
    expect(durationChange(400, 425)).toBe("▼ 25s");
    expect(durationChange(545, 475)).toBe("▲ 1m 10s");
    expect(durationChange(null, 10)).toBe("");
  });
});

describe("periodHeading", () => {
  it("names each period and what it is compared with", () => {
    const heading = (p: "today" | "week" | "month") =>
      periodHeading(p, comparisonPeriods(p, "America/Barbados", NOW));
    expect(heading("today")).toBe("*Today so far* compared with yesterday");
    expect(heading("week")).toBe(
      "*Last week* (26 Oct – 1 Nov) compared with 19 Oct – 25 Oct",
    );
    expect(heading("month")).toBe(
      "*October 2026* compared with September 2026",
    );
  });
});

describe("biggestFinishDrops", () => {
  const form = (
    formId: string,
    cur: [number, number],
    prev: [number, number],
  ) => ({
    formId,
    current: { starts: cur[0], completed: cur[1] },
    previous: { starts: prev[0], completed: prev[1] },
  });

  it("ranks the 3 largest drops and skips small or improving forms", () => {
    const drops = biggestFinishDrops([
      form("a", [100, 50], [100, 60]), // −10
      form("b", [100, 40], [100, 70]), // −30
      form("c", [100, 80], [100, 70]), // improved
      form("d", [10, 0], [100, 90]), // too few starts now
      form("e", [100, 55], [100, 60]), // −5
      form("f", [100, 58], [100, 60]), // −2
    ]);
    expect(drops.map((d) => d.formId)).toEqual(["b", "a", "e"]);
    expect(drops[0]).toMatchObject({
      starts: 100,
      finishRate: 0.4,
      previousFinishRate: 0.7,
    });
  });
});

describe("formatSiteStats", () => {
  const site = {
    current: {
      visitors: 12480,
      starts: 3869,
      completed: 2476,
      avgDurationSeconds: 400,
    },
    previous: {
      visitors: 11556,
      starts: 3814,
      completed: 2250,
      avgDurationSeconds: 425,
    },
  };

  it("shows the headline numbers and the biggest drops", () => {
    const text = formatSiteStats("*Last week*", "/stats", "week", {
      ...site,
      biggestDrops: [
        {
          formId: "passport-renewal",
          starts: 402,
          finishRate: 0.48,
          previousFinishRate: 0.6,
        },
      ],
    });
    expect(text).toMatchInlineSnapshot(`
      "*Last week*
      \`\`\`
      Site visitors         12,480      ▲ 8%
      Visit → start form       31%   ▼ 2 pts
      Start → finish form      64%   ▲ 5 pts
      Forms finished         2,476     ▲ 10%
      Avg time to finish    6m 40s     ▼ 25s
      \`\`\`
      *Biggest drops in finish rate*
      \`\`\`
      Form               Starts   Finish     Change
      passport-renewal      402      48%   ▼ 12 pts
      \`\`\`
      Try \`/stats week passport-renewal\` for details."
    `);
  });

  it("says so when no form lost finish rate", () => {
    const text = formatSiteStats("*Today*", "/stats", "today", {
      ...site,
      biggestDrops: [],
    });
    expect(text).toContain("No form with at least 20 starts lost finish rate.");
  });

  it("shows dashes when there is no data", () => {
    const empty = {
      visitors: 0,
      starts: 0,
      completed: 0,
      avgDurationSeconds: null,
    };
    const text = formatSiteStats("*Today*", "/stats", "today", {
      current: empty,
      previous: empty,
      biggestDrops: [],
    });
    expect(text).toMatch(/Visit → start form +–\n/);
    expect(text).toMatch(/Avg time to finish +–\n/);
  });
});

describe("formatFormStats", () => {
  it("shows headline numbers, step views and top errors", () => {
    const text = formatFormStats("*Last week*", {
      formId: "passport-renewal",
      title: "Renew a passport",
      current: {
        visits: 1120,
        starts: 402,
        completed: 193,
        avgDurationSeconds: 545,
      },
      previous: {
        visits: 1057,
        starts: 410,
        completed: 246,
        avgDurationSeconds: 475,
      },
      steps: [
        { title: "Your details", count: 402 },
        { title: "Upload photo", count: 301 },
        { title: "Payment", count: 320 },
      ],
      topErrors: [
        { label: "Photo", count: 88 },
        { label: "submit failed: network", count: 14 },
      ],
    });
    expect(text).toContain("*Renew a passport* (`passport-renewal`)");
    expect(text).toContain("Start → finish          48%   ▼ 12 pts");
    expect(text).toContain("Upload photo   301   −25%");
    // A step with more views than the one before shows no drop.
    expect(text).toMatch(/Payment\s+320\n/);
    expect(text).toContain(
      "*Top errors*: Photo (88) · submit failed: network (14)",
    );
  });

  it("leaves out empty sections", () => {
    const period = {
      visits: 0,
      starts: 0,
      completed: 0,
      avgDurationSeconds: null,
    };
    const text = formatFormStats("*Today*", {
      formId: "x",
      title: "X",
      current: period,
      previous: period,
      steps: [],
      topErrors: [],
    });
    expect(text).not.toContain("Where people leave");
    expect(text).not.toContain("Top errors");
  });
});
