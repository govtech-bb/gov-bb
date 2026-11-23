import {
  comparisonPeriods,
  eventName,
  type SearchQueryStats,
  type SearchStats,
} from "@govtech-bb/umami-analytics";
import {
  biggestFinishDrops,
  countChange,
  duration,
  durationChange,
  formatChatStats,
  formatFormStats,
  formatSearchStats,
  formatSiteStats,
  periodHeading,
  plainSlackText,
  rateChange,
  slackQuery,
  stepBars,
  tallyDeadEnds,
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

  it("counts change the other way when fewer is better", () => {
    expect(countChange(108, 100, "down")).toBe("🔴 ▲ 8%");
    expect(countChange(90, 100, "down")).toBe("🟢 ▼ 10%");
    expect(countChange(5, 0, "down")).toBe("🔴 new");
  });

  it("rates change in percentage points", () => {
    expect(rateChange(0.64, 0.59)).toBe("🟢 ▲ 5 pts");
    expect(rateChange(0.31, 0.33)).toBe("🔴 ▼ 2 pts");
    expect(rateChange(0.5, 0.5)).toBe("⚪ no change");
    expect(rateChange(null, 0.5)).toBe("");
    expect(rateChange(0.1, 0.2, "down")).toBe("🟢 ▼ 10 pts");
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

describe("tallyDeadEnds", () => {
  // 56 characters: over 44, so its events use a hashed form key.
  const LONG = "apply-for-national-summer-camp-programme-tropical-trails";
  // 37 characters: its events fit only with a short event code.
  const MEDIUM = "apply-for-a-temporary-teacher-position";

  it("adds up packed names, short codes and hashed form keys", () => {
    expect(eventName(LONG, "form-closed-view")).toMatch(/~\w{6}:fclsd$/);
    expect(eventName(MEDIUM, "form-load-error")).toBe(`${MEDIUM}:flerr`);

    const { deadEnds, topForm } = tallyDeadEnds(
      [
        { x: "page-not-found", y: 40 },
        { x: "service-unavailable-view", y: 2 },
        { x: "search", y: 900 },
      ],
      [
        { x: "passport-renewal:form-closed-view", y: 5 },
        { x: "passport-renewal:form-start", y: 300 },
        { x: eventName(LONG, "form-closed-view"), y: 7 },
        { x: eventName(LONG, "form-load-error"), y: 1 },
        { x: eventName(MEDIUM, "form-load-error"), y: 3 },
        // A form that is not found has no form, so the name is not packed.
        { x: "form-load-error", y: 4 },
      ],
      ["passport-renewal", LONG, MEDIUM],
    );

    expect(deadEnds).toEqual({
      formClosed: 12,
      formLoadError: 8,
      serviceUnavailable: 2,
      pageNotFound: 40,
    });
    expect(topForm).toEqual({ formId: LONG, count: 8 });
  });

  it("counts a form key it cannot map back, but never names it", () => {
    const { deadEnds, topForm } = tallyDeadEnds(
      [],
      [
        { x: eventName(LONG, "form-closed-view"), y: 3 },
        // Anyone can send Umami an event name.
        { x: "x`<!channel> <evil.example|click> &amp;:fclsd", y: 50 },
        { x: "passport-renewal:form-load-error", y: 1 },
      ],
      ["passport-renewal"],
    );
    expect(deadEnds.formClosed).toBe(53);
    expect(topForm).toEqual({ formId: "passport-renewal", count: 1 });
  });

  it("has no top form when no form had a dead end", () => {
    const { deadEnds, topForm } = tallyDeadEnds(
      [{ x: "page-not-found", y: 1 }],
      [{ x: "form-load-error", y: 2 }],
      [],
    );
    expect(deadEnds.formLoadError).toBe(2);
    expect(topForm).toBeNull();
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
  const noDeadEnds = {
    formClosed: 0,
    formLoadError: 0,
    serviceUnavailable: 0,
    pageNotFound: 0,
  };
  const site = {
    current: {
      visitors: 12480,
      starts: 3869,
      completed: 2476,
      avgDurationSeconds: 400,
      deadEnds: {
        formClosed: 12,
        formLoadError: 3,
        serviceUnavailable: 0,
        pageNotFound: 140,
      },
      topDeadEndForm: { formId: "summer-camp", count: 9 },
    },
    previous: {
      visitors: 11556,
      starts: 3814,
      completed: 2250,
      avgDurationSeconds: 425,
      deadEnds: {
        formClosed: 10,
        formLoadError: 4,
        serviceUnavailable: 0,
        pageNotFound: 140,
      },
      topDeadEndForm: null,
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
      *🚧 Dead ends:* closed form *12* 🔴 ▲ 20% · form didn't load *3* 🟢 ▼ 25% · service unavailable *0* ⚪ no change · page not found *140* ⚪ no change · most on \`summer-camp\` (9)
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

  it("shows dashes and no dead ends when there is no data", () => {
    const empty = {
      visitors: 0,
      starts: 0,
      completed: 0,
      avgDurationSeconds: null,
      deadEnds: noDeadEnds,
      topDeadEndForm: null,
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
    expect(text).not.toContain("Dead ends");
  });

  it("shows dead ends that stopped this period, with no top form", () => {
    const text = render(
      formatSiteStats(LAST_WEEK, "/stats", "week", {
        current: {
          ...site.current,
          deadEnds: noDeadEnds,
          topDeadEndForm: null,
        },
        previous: site.previous,
        biggestDrops: [],
      }),
    );
    expect(text).toContain(
      "*🚧 Dead ends:* closed form *0* 🟢 ▼ 100% · form didn't load *0* 🟢 ▼ 100% · service unavailable *0* ⚪ no change · page not found *0* 🟢 ▼ 100%\n",
    );
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

describe("formatSearchStats", () => {
  const query = (
    q: string,
    searches: number,
    zeroResult = false,
  ): SearchQueryStats => ({
    query: q,
    searches,
    clicks: 0,
    ctr: 0,
    zeroResult,
  });
  const stats = (o: Partial<SearchStats>): SearchStats => ({
    searches: 0,
    clicks: 0,
    ctr: 0,
    zeroResultRate: 0,
    queries: [],
    ...o,
  });

  it("shows the counts and the two query lists for a normal week", () => {
    const message = formatSearchStats(LAST_WEEK, {
      current: stats({
        searches: 1200,
        clicks: 780,
        zeroResultRate: 0.12,
        queries: [
          query("passport", 300),
          query("", 120),
          query("nis", 90),
          query("birth certificate", 80),
          query("tamis", 40, true),
          query("driver licence", 30),
          query("road tax", 20),
          query("1****6", 10, true),
        ],
      }),
      previous: stats({ searches: 1000, clicks: 800, zeroResultRate: 0.15 }),
      noResults: [
        { value: "1****6", total: 10 },
        { value: "", total: 50 },
        { value: "tamis", total: 25 },
      ],
    });
    expect(message.text).toBe(
      "🔎 Last week: 1,200 searches, 780 result clicks",
    );
    expect(render(message)).toMatchInlineSnapshot(`
      "🔎 Search · Last week
      26 Oct – 1 Nov, compared with 19 Oct – 25 Oct
      *🔎 Searches*
      *1,200*   🟢 ▲ 20%
      *🚫 No results*
      *12%*   🟢 ▼ 3 pts
      *👆 Result clicks*
      *780*   🔴 ▼ 3%
      ---
      *🔝 Top searches*
      • passport: *300*
      • nis: *90*
      • birth certificate: *80*
      • tamis: *40*
      • driver licence: *30*
      *🤷 Top searches that found nothing*
      • tamis: *25*
      • 1∗∗∗∗6: *10*
      Numbers are searches for each query. Queries searched fewer than 3 times are not shown."
    `);
  });

  it("says so when nobody searched", () => {
    const message = formatSearchStats(LAST_WEEK, {
      current: stats({}),
      previous: stats({ searches: 40, clicks: 10, zeroResultRate: 0.1 }),
      noResults: [],
    });
    expect(render(message)).toMatchInlineSnapshot(`
      "🔎 Search · Last week
      26 Oct – 1 Nov, compared with 19 Oct – 25 Oct
      *🔎 Searches*
      *0*   🔴 ▼ 100%
      *🚫 No results*
      *–*
      *👆 Result clicks*
      *0*   🔴 ▼ 100%
      No searches in this period."
    `);
  });

  it("leaves out queries searched fewer than 3 times, and merges look-alikes", () => {
    const message = formatSearchStats(LAST_WEEK, {
      current: stats({
        searches: 9,
        queries: [
          query("passport", 2),
          query("pass_port", 2),
          query("jane doe", 1, true),
          query("nis", 1),
        ],
      }),
      previous: stats({}),
      noResults: [
        { value: "jane doe", total: 1 },
        { value: "tamis", total: 2 },
        { value: "tam_is", total: 1 },
      ],
    });
    const text = render(message);
    expect(text).toContain("*🔝 Top searches*\n• passport: *4*");
    expect(text).toContain("found nothing*\n• tamis: *3*");
    expect(text).not.toContain("jane doe");
    expect(text).not.toContain("nis");
  });

  it("says so when no query was searched 3 or more times", () => {
    const message = formatSearchStats(LAST_WEEK, {
      current: stats({ searches: 2, queries: [query("jane doe", 1, true)] }),
      previous: stats({}),
      noResults: [{ value: "jane doe", total: 1 }],
    });
    const text = render(message);
    expect(text).toContain("No query was searched 3 or more times.");
    expect(text).not.toContain("jane doe");
  });

  it("shows the found-nothing list on its own when it is the only one", () => {
    const text = render(
      formatSearchStats(LAST_WEEK, {
        current: stats({ searches: 3 }),
        previous: stats({}),
        noResults: [{ value: "tamis", total: 3 }],
      }),
    );
    expect(text).not.toContain("Top searches*");
    expect(text).toContain("found nothing*\n• tamis: *3*");
  });

  it("can't add formatting, links or mentions through a query", () => {
    const hostile =
      "x` *bold* <!channel> <@U123> <https://e.vil|hi> &amp;\n```";
    const message = formatSearchStats(LAST_WEEK, {
      current: stats({ searches: 5, queries: [query(hostile, 5, true)] }),
      previous: stats({}),
      noResults: [{ value: hostile, total: 5 }],
    });
    const lists = message.blocks.filter(
      (b) => (b as { text?: { verbatim?: boolean } }).text?.verbatim,
    ) as { text: { text: string } }[];
    expect(lists).toHaveLength(2);
    for (const { text } of lists) {
      const [, line, ...rest] = text.text.split("\n");
      expect(rest).toEqual([]);
      expect(line).toBe(
        "• x ∗bold∗ &lt;!channel&gt; &lt;@U123&gt; &lt;https://e.vil|hi&gt; &amp;amp;: *5*",
      );
    }
  });
});

describe("slackQuery", () => {
  it("keeps a masked number as sent, without bold", () => {
    expect(slackQuery("nis 1****6")).toBe("nis 1∗∗∗∗6");
  });

  it("is empty for a blank query", () => {
    expect(slackQuery("  ")).toBe("");
  });
});
