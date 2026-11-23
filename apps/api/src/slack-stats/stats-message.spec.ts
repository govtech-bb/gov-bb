import { comparisonPeriods } from "@govtech-bb/umami-analytics";
import {
  biggestFinishDrops,
  countChange,
  duration,
  durationChange,
  formatChatStats,
  formatFormStats,
  formatSiteStats,
  periodHeading,
  plainSlackText,
  rateChange,
  stepBars,
  type SlackMessage,
} from "./stats-message";

const NOW = new Date("2026-11-04T18:30:00Z");

describe("change helpers", () => {
  it("counts change in percent, green when it goes up", () => {
    expect(countChange(108, 100)).toBe("🟢 ▲ 8%");
    expect(countChange(90, 100)).toBe("🔴 ▼ 10%");
    expect(countChange(5, 5)).toBe("⚪ no change");
    expect(countChange(5, 0)).toBe("🆕 new");
  });

  it("rates change in percentage points", () => {
    expect(rateChange(0.64, 0.59)).toBe("🟢 ▲ 5 pts");
    expect(rateChange(0.31, 0.33)).toBe("🔴 ▼ 2 pts");
    expect(rateChange(0.5, 0.5)).toBe("⚪ no change");
    expect(rateChange(null, 0.5)).toBe("");
  });

  it("formats durations, green when the time gets shorter", () => {
    expect(duration(400)).toBe("6m 40s");
    expect(duration(45)).toBe("45s");
    expect(duration(12_863)).toBe("3h 34m");
    expect(duration(null)).toBe("–");
    expect(durationChange(400, 425)).toBe("🟢 ▼ 25s");
    expect(durationChange(545, 475)).toBe("🔴 ▲ 1m 10s");
    expect(durationChange(5, 5)).toBe("⚪ no change");
    expect(durationChange(null, 10)).toBe("");
  });
});

describe("periodHeading", () => {
  const heading = (p: "today" | "week" | "month", now = NOW) =>
    periodHeading(p, comparisonPeriods(p, "America/Barbados", now));

  it("names each period and what it is compared with", () => {
    expect(heading("today")).toEqual({
      title: "Today so far",
      detail: "Compared with yesterday",
    });
    expect(heading("week")).toEqual({
      title: "Last week",
      detail: "26 Oct – 1 Nov, compared with 19 Oct – 25 Oct",
    });
    expect(heading("month")).toEqual({
      title: "October 2026",
      detail: "Compared with September 2026",
    });
  });

  it("ends last week on Sunday when run early on a Monday", () => {
    // Monday 2 Nov 06:31 in Barbados.
    expect(heading("week", new Date("2026-11-02T10:31:00Z")).detail).toBe(
      "26 Oct – 1 Nov, compared with 19 Oct – 25 Oct",
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

/** The visible text of a message, block by block, for assertions. */
function render({ blocks }: SlackMessage): string {
  return (blocks as Record<string, any>[])
    .map(
      (b) =>
        b.text?.text ??
        b.fields?.map((f: { text: string }) => f.text).join("\n") ??
        b.elements?.map((e: { text: string }) => e.text).join(" ") ??
        "---",
    )
    .join("\n");
}

const LAST_WEEK = {
  title: "Last week",
  detail: "26 Oct – 1 Nov, compared with 19 Oct – 25 Oct",
};

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
    const message = formatSiteStats(LAST_WEEK, "/stats", "week", {
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
    expect(message.text).toBe(
      "📊 Last week: 12,480 visitors, 2,476 forms finished",
    );
    expect(render(message)).toMatchInlineSnapshot(`
      "📊 Site and forms · Last week
      26 Oct – 1 Nov, compared with 19 Oct – 25 Oct
      *👥 Site visitors*
      *12,480*   🟢 ▲ 8%
      *🚪 Visit → start form*
      *31%*   🔴 ▼ 2 pts
      *🏁 Start → finish form*
      *64%*   🟢 ▲ 5 pts
      *📨 Forms finished*
      *2,476*   🟢 ▲ 10%
      *⏱️ Avg time to finish*
      *6m 40s*   🟢 ▼ 25s
      ---
      *📉 Biggest drops in finish rate*
      • \`passport-renewal\`: 402 starts, *48%* finish   🔴 ▼ 12 pts
      💡 For one form, try \`/stats week passport-renewal\`"
    `);
  });

  it("says so when no form lost finish rate", () => {
    const message = formatSiteStats(LAST_WEEK, "/stats", "today", {
      ...site,
      biggestDrops: [],
    });
    expect(render(message)).toContain(
      "✅ No form with at least 20 starts lost finish rate.",
    );
  });

  it("shows dashes when there is no data", () => {
    const empty = {
      visitors: 0,
      starts: 0,
      completed: 0,
      avgDurationSeconds: null,
    };
    const text = render(
      formatSiteStats(LAST_WEEK, "/stats", "today", {
        current: empty,
        previous: empty,
        biggestDrops: [],
      }),
    );
    expect(text).toContain("*🚪 Visit → start form*\n*–*\n");
    expect(text).toContain("*⏱️ Avg time to finish*\n*–*\n");
  });
});

describe("stepBars", () => {
  it("scales bars to the busiest step and shortens long titles", () => {
    expect(
      stepBars([
        { title: "Tell us about yourself", count: 120 },
        {
          title: "Are you applying for your own birth certificate?",
          count: 60,
        },
        { title: "Payment", count: 0 },
      ]),
    ).toMatchInlineSnapshot(`
      "\`\`\`
      Tell us about yourself              ████████████  120
      Are you applying for your own bir…  ██████░░░░░░   60
      Payment                             ░░░░░░░░░░░░    0
      \`\`\`"
    `);
  });
});

describe("formatFormStats", () => {
  it("shows headline numbers, step views and top errors", () => {
    const message = formatFormStats(LAST_WEEK, {
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
      ],
      topErrors: [
        { label: "Photo", count: 88 },
        { label: "submit failed: network", count: 14 },
      ],
    });
    expect(message.text).toBe(
      "📝 Renew a passport · Last week: 402 started, 193 finished",
    );
    expect(render(message)).toMatchInlineSnapshot(`
      "📝 Renew a passport
      \`passport-renewal\` · *Last week* · 26 Oct – 1 Nov, compared with 19 Oct – 25 Oct
      *👥 Visitors to form*
      *1,120*   🟢 ▲ 6%
      *🚪 Visit → start*
      *36%*   🔴 ▼ 3 pts
      *🏁 Start → finish*
      *48%*   🔴 ▼ 12 pts
      *📨 Finished*
      *193*   🔴 ▼ 22%
      *⏱️ Avg time to finish*
      *9m 05s*   🔴 ▲ 1m 10s
      ---
      *🚶 Where people leave*
      \`\`\`
      Your details  ████████████  402
      Upload photo  █████████░░░  301
      \`\`\`
      Views of each step. Steps that only some people see have fewer views.
      ---
      *🚨 Top errors*
      • Photo: *88*
      • submit failed: network: *14*"
    `);
  });

  it("leaves out empty sections", () => {
    const period = {
      visits: 0,
      starts: 0,
      completed: 0,
      avgDurationSeconds: null,
    };
    const text = render(
      formatFormStats(LAST_WEEK, {
        formId: "x",
        title: "X",
        current: period,
        previous: period,
        steps: [],
        topErrors: [],
      }),
    );
    expect(text).not.toContain("Where people leave");
    expect(text).not.toContain("Top errors");
  });

  it("caps visit → start at 100%, like the dashboard", () => {
    const text = render(
      formatFormStats(LAST_WEEK, {
        formId: "x",
        title: "X",
        current: {
          visits: 100,
          starts: 104,
          completed: 0,
          avgDurationSeconds: null,
        },
        previous: {
          visits: 100,
          starts: 90,
          completed: 0,
          avgDurationSeconds: null,
        },
        steps: [],
        topErrors: [],
      }),
    );
    expect(text).toContain("*🚪 Visit → start*\n*100%*   🟢 ▲ 10 pts");
  });
});

describe("formatChatStats", () => {
  const counts = (o: Record<string, number>) =>
    Object.entries(o).map(([label, count]) => ({ label, count }));

  it("shows questions by source and the top suggestions for a normal week", () => {
    const message = formatChatStats(LAST_WEEK, {
      current: {
        bySource: counts({ home: 120, services: 30 }),
        suggestions: counts({
          "How do I renew my passport?": 12,
          "When is the next public holiday?": 8,
          "How do I register a birth?": 4,
          "Where is my nearest polyclinic?": 1,
        }),
      },
      previous: {
        bySource: counts({ home: 100, results: 10 }),
        suggestions: counts({ "How do I renew my passport?": 15 }),
      },
    });
    expect(message.text).toBe(
      "💬 Chat on landing · Last week: 150 questions asked, 25 suggestions picked",
    );
    expect(render(message)).toMatchInlineSnapshot(`
      "💬 Chat on landing · Last week
      26 Oct – 1 Nov, compared with 19 Oct – 25 Oct
      *💬 Questions asked*
      *150*   🟢 ▲ 36%
      *👆 Suggestions picked*
      *25*   🟢 ▲ 67%
      ---
      *📍 Questions asked, by where on landing*
      • \`home\`: *120*   🟢 ▲ 20%
      • \`services\`: *30*   🆕 new
      • \`results\`: *0*   🔴 ▼ 100%
      *⭐ Top suggested questions picked*
      • How do I renew my passport?: *12*   🔴 ▼ 20%
      • When is the next public holiday?: *8*   🆕 new
      • How do I register a birth?: *4*   🆕 new
      ℹ️ Answer outcomes (answered, error, stopped) are not included yet."
    `);
  });

  it("shows a clear empty state when there are no chat events", () => {
    const message = formatChatStats(LAST_WEEK, {
      current: { bySource: [], suggestions: [] },
      previous: {
        bySource: counts({ home: 7 }),
        suggestions: counts({ "How do I renew my passport?": 2 }),
      },
    });
    expect(message.text).toBe(
      "💬 Chat on landing · Last week: 0 questions asked, 0 suggestions picked",
    );
    expect(render(message)).toMatchInlineSnapshot(`
      "💬 Chat on landing · Last week
      26 Oct – 1 Nov, compared with 19 Oct – 25 Oct
      💤 Nobody asked a chat question or picked a suggested question. The period before: 7 asked, 2 picked.
      ℹ️ Answer outcomes (answered, error, stopped) are not included yet."
    `);
  });

  it("folds sources past the top 5 into one line", () => {
    const text = render(
      formatChatStats(LAST_WEEK, {
        current: {
          bySource: counts({ a: 9, b: 8, c: 7, d: 6, e: 5, f: 2, g: 1 }),
          suggestions: [],
        },
        previous: { bySource: [], suggestions: [] },
      }),
    );
    expect(text).toContain("• `e`: *5*   🆕 new\n• other places: *3*");
    expect(text).not.toContain("Top suggested questions");
  });
  it("keeps event data inert: no links, mentions or look-alike rows", () => {
    const message = formatChatStats(LAST_WEEK, {
      current: {
        bySource: counts({ home: 3, "home ": 2, "*home*": 1 }),
        suggestions: counts({ "Renew at https://evil.example <!here>": 4 }),
      },
      previous: { bySource: [], suggestions: [] },
    });
    const sections = (message.blocks as Record<string, any>[]).filter(
      (b) => b.type === "section" && b.text,
    );
    expect(sections.map((b) => b.text.verbatim)).toEqual([true, true]);
    const text = render(message);
    expect(text).toContain("• `home`: *6*   🆕 new\n");
    expect(text).toContain(
      "• Renew at https://evil.example &lt;!here&gt;: *4*",
    );
  });

  it("leaves out the sources when only suggestions were picked", () => {
    const text = render(
      formatChatStats(LAST_WEEK, {
        current: {
          bySource: [],
          suggestions: counts({ "How do I register a birth?": 2 }),
        },
        previous: { bySource: [], suggestions: [] },
      }),
    );
    expect(text).toContain("*💬 Questions asked*\n*0*   ⚪ no change");
    expect(text).not.toContain("by where on landing");
    expect(text).toContain("• How do I register a birth?: *2*   🆕 new");
  });
});

describe("plainSlackText", () => {
  it("can't mention, link or format", () => {
    expect(plainSlackText("<!channel> *hi* <https://x.example|me> & `x`")).toBe(
      "&lt;!channel&gt; hi &lt;https://x.example|me&gt; &amp; x",
    );
  });

  it("keeps one line and shortens long text", () => {
    expect(plainSlackText("a\n• b")).toBe("a • b");
    const long = plainSlackText("x".repeat(200));
    expect(long).toHaveLength(80);
    expect(long.endsWith("…")).toBe(true);
    // Shortened by code point, so no emoji is cut in half.
    expect(Array.from(plainSlackText("😀".repeat(100)))).toEqual([
      ...Array(79).fill("😀"),
      "…",
    ]);
  });
});
