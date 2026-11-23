import {
  TOOLS,
  comparisonPeriods,
  shapeJourneyList,
  eventName,
  type SearchQueryStats,
  type SearchStats,
} from "@govtech-bb/umami-analytics";
import {
  biggestFinishDrops,
  countChange,
  countHandOffs,
  duration,
  durationChange,
  formatChatStats,
  formatFormStats,
  formatJourneyStats,
  formatSearchStats,
  formatSiteStats,
  formatToolStats,
  formatToolsSummary,
  periodHeading,
  plainSlackText,
  rateChange,
  slackQuery,
  stepBars,
  tallyDeadEnds,
  tallyTopErrors,
  type SlackMessage,
  type ToolPeriod,
  type ToolTotals,
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

  it("rates change the other way when lower is better", () => {
    expect(rateChange(0.31, 0.33, "down")).toBe("🟢 ▼ 2 pts");
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

describe("tallyTopErrors", () => {
  const labels = new Map([
    ["name", "Full name"],
    ["photo", "Photo"],
  ]);
  // Anyone can send Umami event data.
  const HOSTILE = [
    "<!channel>",
    "<https://evil.example|x>",
    "&amp;",
    "x`bold`",
  ];

  it("names the form's own fields and the known submit codes", () => {
    expect(
      tallyTopErrors(
        [
          { field: "name", count: 9 },
          { field: "photo", count: 2 },
        ],
        [
          { value: "network", total: 4 },
          { value: "validation", total: 1 },
        ],
        labels,
      ),
    ).toEqual([
      { label: "Full name", count: 9 },
      { label: "submit failed: network", count: 4 },
      { label: "Photo", count: 2 },
    ]);
  });

  it("keeps two fields with the same label in two rows", () => {
    expect(
      tallyTopErrors(
        [
          { field: "home-address-line-1", count: 5 },
          { field: "work-address-line-1", count: 4 },
        ],
        [],
        new Map([
          ["home-address-line-1", "Address line 1"],
          ["work-address-line-1", "Address line 1"],
        ]),
      ),
    ).toEqual([
      { label: "Address line 1", count: 5 },
      { label: "Address line 1", count: 4 },
    ]);
  });

  it("knows every code apps/forms sends", () => {
    const codes = ["validation", "network", "server", "payment-init"];
    expect(
      tallyTopErrors(
        [],
        codes.map((value) => ({ value, total: 1 })),
        labels,
      ).map((e) => e.label),
    ).toEqual(codes.slice(0, 3).map((c) => `submit failed: ${c}`));
    expect(
      tallyTopErrors([], [{ value: "payment-init", total: 1 }], labels),
    ).toEqual([{ label: "submit failed: payment-init", count: 1 }]);
  });

  it("counts unknown fields and codes in one row each, but never names them", () => {
    const top = tallyTopErrors(
      [
        { field: "name", count: 3 },
        ...HOSTILE.map((field) => ({ field, count: 5 })),
      ],
      [
        { value: "network", total: 1 },
        ...HOSTILE.map((value) => ({ value, total: 2 })),
      ],
      labels,
    );
    expect(top).toEqual([
      { label: "other fields", count: 20 },
      { label: "submit failed: other", count: 8 },
      { label: "Full name", count: 3 },
    ]);
  });
});

/** The visible text of a message, block by block, for assertions. */
/** The isolates around a label (FSI, PDI) show nothing, so render shows them as ⁅ and ⁆. */
const FSI = "\u2068";
const PDI = "\u2069";

function render({ blocks }: SlackMessage): string {
  return (blocks as Record<string, any>[])
    .map(
      (b) =>
        b.text?.text ??
        b.fields?.map((f: { text: string }) => f.text).join("\n") ??
        b.elements?.map((e: { text: string }) => e.text).join(" ") ??
        "---",
    )
    .join("\n")
    .replaceAll(FSI, "⁅")
    .replaceAll(PDI, "⁆");
}

const LAST_WEEK = {
  title: "Last week",
  detail: "26 Oct – 1 Nov, compared with 19 Oct – 25 Oct",
};

/** Right-to-left override and zero-width space. */
const RLO = "\u202E";
const ZWSP = "\u200B";
/**
 * Bidi controls and invisible characters plainSlackText removes: those named
 * in #3825, then a soft hyphen and tag characters, which can hide a string.
 */
const HIDDEN = [
  0x061c,
  ...[0x200b, 0x200c, 0x200d, 0x200e, 0x200f],
  ...[0x202a, 0x202b, 0x202c, 0x202d, 0x202e],
  0x2060,
  ...[0x2066, 0x2067, 0x2068, 0x2069],
  0xfeff,
  0x00ad,
  ...[0xe0001, 0xe0049, 0xe007f],
].map((c) => String.fromCodePoint(c));

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
      • ⁅Photo⁆: *88*
      • ⁅submit failed: network⁆: *14*"
    `);
    const errors = (message.blocks as Record<string, any>[]).at(-1)!;
    // Stops Slack linking a bare URL or #channel in a label.
    expect(errors.text.verbatim).toBe(true);
  });

  it("shows form text with Slack's control and formatting characters as plain text", () => {
    const period = {
      visits: 0,
      starts: 0,
      completed: 0,
      avgDurationSeconds: null,
    };
    const message = formatFormStats(LAST_WEEK, {
      formId: "x",
      title: "Fees & <charges>",
      current: period,
      previous: period,
      steps: [
        { title: "Fees & <charges> *now* _x_ ~y~", count: 4 },
        { title: "Your ```details```", count: 2 },
      ],
      topErrors: [{ label: "Name & <title> *required* _x_ ~y~ `z`", count: 1 }],
    });
    expect(message.text).toBe(
      "📝 Fees &amp; &lt;charges&gt; · Last week: 0 started, 0 finished",
    );
    // A code block shows * _ ~ as typed. Titles are padded before escaping,
    // so the bars still line up.
    expect(render(message)).toContain(
      [
        "```",
        "Fees &amp; &lt;charges&gt; *now* _x_ ~y~  ████████████  4",
        "Your details                    ██████░░░░░░  2",
        "```",
      ].join("\n"),
    );
    expect(render(message)).toContain(
      "• ⁅Name &amp; &lt;title&gt; required x y z⁆: *1*",
    );
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
      • \`⁅home⁆\`: *120*   🟢 ▲ 20%
      • \`⁅services⁆\`: *30*   🆕 new
      • \`⁅results⁆\`: *0*   🔴 ▼ 100%
      *⭐ Top suggested questions picked*
      • ⁅How do I renew my passport?⁆: *12*   🔴 ▼ 20%
      • ⁅When is the next public holiday?⁆: *8*   🆕 new
      • ⁅How do I register a birth?⁆: *4*   🆕 new
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
    expect(text).toContain("• `⁅e⁆`: *5*   🆕 new\n• other places: *3*");
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
    expect(text).toContain("• `⁅home⁆`: *6*   🆕 new\n");
    expect(text).toContain(
      "• ⁅Renew at https://evil.example &lt;!here&gt;⁆: *4*",
    );
  });

  it("isolates right-to-left labels, so the count and change stay after them", () => {
    const hebrew = "בית";
    const arabic = "كيف أجدد جواز سفري؟";
    const message = formatChatStats(LAST_WEEK, {
      current: {
        // A sender's own PDI is removed, so it can't end the isolate early.
        bySource: counts({ [`${PDI}${hebrew}`]: 5 }),
        suggestions: counts({ [arabic]: 4 }),
      },
      previous: { bySource: [], suggestions: counts({ [arabic]: 2 }) },
    });
    const lines = (message.blocks as Record<string, any>[])
      .filter((b) => b.type === "section" && b.text)
      .map((b) => b.text.text.split("\n")[1]);
    expect(lines).toEqual([
      `• \`${FSI}${hebrew}${PDI}\`: *5*   🆕 new`,
      `• ${FSI}${arabic}${PDI}: *4*   🟢 ▲ 100%`,
    ]);
  });

  it("shows one placeholder row for labels with nothing left to show", () => {
    const text = render(
      formatChatStats(LAST_WEEK, {
        current: {
          bySource: counts({ [ZWSP]: 3, "*_*": 2, "(blank)": 1 }),
          suggestions: counts({ [`${ZWSP}${ZWSP}`]: 4, __: 1 }),
        },
        previous: { bySource: [], suggestions: [] },
      }),
    );
    // In italics, which no label can be: plainSlackText removes `_`.
    expect(text).toContain(
      "• _(blank)_: *5*   🆕 new\n• `⁅(blank)⁆`: *1*   🆕 new",
    );
    expect(text).toContain("picked*\n• _(blank)_: *5*   🆕 new\n");
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
    expect(text).toContain("• ⁅How do I register a birth?⁆: *2*   🆕 new");
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

  it("removes characters that reverse or hide text", () => {
    for (const c of HIDDEN) {
      expect(plainSlackText(`a${c}b`)).toBe("ab");
    }
    // Removed first, so they don't use up the 80 characters.
    expect(plainSlackText(HIDDEN.join("").repeat(10) + "x".repeat(81))).toBe(
      "x".repeat(79) + "…",
    );
  });
});

describe("hidden characters", () => {
  it("shows no reversing or zero-width character in any reply", () => {
    const hostile = `pass${RLO}port${ZWSP}`;
    const row = { value: hostile, total: 5 };
    const replies = [
      formatSearchStats(LAST_WEEK, {
        current: {
          searches: 5,
          clicks: 0,
          ctr: 0,
          zeroResultRate: 1,
          queries: [
            {
              query: hostile,
              searches: 5,
              clicks: 0,
              ctr: 0,
              zeroResult: true,
            },
          ],
        },
        previous: {
          searches: 0,
          clicks: 0,
          ctr: 0,
          zeroResultRate: 0,
          queries: [],
        },
        noResults: [row],
      }),
      formatChatStats(LAST_WEEK, {
        current: {
          bySource: [{ label: hostile, count: 5 }],
          suggestions: [{ label: hostile, count: 5 }],
        },
        previous: { bySource: [], suggestions: [] },
      }),
      formatJourneyStats(LAST_WEEK, {
        paths: shapeJourneyList([{ items: ["/", `/${hostile}`], count: 5 }]),
        current: {
          "page-service-view": 0,
          "page-start-view": 0,
          "start-click": 0,
          "form-start": 0,
        },
        previous: {
          "page-service-view": 0,
          "page-start-view": 0,
          "start-click": 0,
          "form-start": 0,
        },
      }),
      formatToolStats(LAST_WEEK, {
        tool: TOOLS[0],
        current: {
          visitors: 5,
          events: {
            results: 5,
            noResultRate: 0,
            topAction: { action: hostile, count: 5 },
            errors: 5,
            errorRate: 0.5,
          },
          stepViews: 5,
          steps: [row],
          actions: [row],
          errors: [row],
        },
        previous: {
          visitors: 0,
          events: null,
          stepViews: 0,
          steps: [],
          actions: [],
          errors: [],
        },
      }),
    ];
    for (const reply of replies) {
      const json = JSON.stringify(reply);
      expect(json).toMatch(/passport/i);
      // The only hidden characters left are the isolates around each label.
      const unwrapped = json.replace(
        new RegExp(`${FSI}([^${FSI}${PDI}]*)${PDI}`, "g"),
        "$1",
      );
      for (const c of HIDDEN) expect(unwrapped).not.toContain(c);
    }
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
      • ⁅passport⁆: *300*
      • ⁅nis⁆: *90*
      • ⁅birth certificate⁆: *80*
      • ⁅tamis⁆: *40*
      • ⁅driver licence⁆: *30*
      *🤷 Top searches that found nothing*
      • ⁅tamis⁆: *25*
      • ⁅1∗∗∗∗6⁆: *10*
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

  it("leaves out queries searched fewer than 3 times, then merges look-alikes", () => {
    const message = formatSearchStats(LAST_WEEK, {
      current: stats({
        searches: 12,
        queries: [
          query("passport", 3),
          query("pass_port", 4),
          query("pass~port", 2),
          query("jane doe", 1, true),
          query("nis", 2),
        ],
      }),
      previous: stats({}),
      noResults: [
        { value: "jane doe", total: 1 },
        { value: "tamis", total: 3 },
        { value: "tam_is", total: 2 },
      ],
    });
    const text = render(message);
    expect(text).toContain("*🔝 Top searches*\n• ⁅passport⁆: *7*\n*");
    expect(text).toContain("found nothing*\n• ⁅tamis⁆: *3*\n");
    expect(text).not.toContain("jane doe");
    expect(text).not.toContain("nis");
  });

  it("doesn't let look-alikes searched fewer than 3 times each add up to 3", () => {
    // Three people each typed one name once, a little differently.
    const message = formatSearchStats(LAST_WEEK, {
      current: stats({
        searches: 3,
        queries: [
          query("jane doe", 1, true),
          query("jane  doe", 1, true),
          query(`jane${ZWSP} doe`, 1, true),
        ],
      }),
      previous: stats({}),
      noResults: [
        { value: "jane_doe", total: 1 },
        { value: "jane~doe", total: 1 },
        { value: "janedoe", total: 1 },
      ],
    });
    const text = render(message);
    expect(text).toContain("No query was searched 3 or more times.");
    expect(text).not.toMatch(/jane/i);
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
    expect(text).toContain("found nothing*\n• ⁅tamis⁆: *3*");
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
        `• ${FSI}x ∗bold∗ &lt;!channel&gt; &lt;@U123&gt; &lt;https://e.vil|hi&gt; &amp;amp;${PDI}: *5*`,
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

describe("formatToolStats", () => {
  const tool = (id: string) => TOOLS.find((t) => t.id === id)!;
  const rows = (o: Record<string, number>) =>
    Object.entries(o).map(([value, total]) => ({ value, total }));
  const quiet: ToolPeriod = {
    visitors: 0,
    events: null,
    stepViews: 0,
    steps: [],
    actions: [],
    errors: [],
  };

  it("shows a tool's events, compared with the period before", () => {
    const message = formatToolStats(LAST_WEEK, {
      tool: tool("pharmacy-finder"),
      current: {
        visitors: 420,
        events: {
          results: 300,
          noResultRate: 0.1,
          topAction: { action: "call", count: 40 },
          errors: 12,
          errorRate: 12 / 312,
        },
        stepViews: 500,
        steps: rows({ find: 380, hero: 120 }),
        actions: rows({ call: 40, "call-drug-service": 9, about: 2, x: 1 }),
        errors: rows({ "location-denied": 10, "location-unavailable": 2 }),
      },
      previous: {
        visitors: 400,
        events: {
          results: 250,
          noResultRate: 0.2,
          topAction: { action: "call", count: 50 },
          errors: 6,
          errorRate: 6 / 256,
        },
        stepViews: 450,
        steps: rows({ find: 300, hero: 150 }),
        actions: rows({ call: 50 }),
        errors: rows({ "location-denied": 6 }),
      },
    });
    expect(message.text).toBe(
      "🧰 Find an open pharmacy · Last week: 420 visitors, 300 results",
    );
    expect(render(message)).toMatchInlineSnapshot(`
      "🧰 Find an open pharmacy
      \`pharmacy-finder\` · *Last week* · 26 Oct – 1 Nov, compared with 19 Oct – 25 Oct
      *👥 Visitors to the tool*
      *420*   🟢 ▲ 5%
      *👣 Step views*
      *500*   🟢 ▲ 11%
      *✅ Results*
      *300*   🟢 ▲ 20%
      *🚫 No results*
      *10%*   🟢 ▼ 10 pts
      *⚠️ Errors*
      *12*   🔴 ▲ 100%
      ---
      *👣 Views of each step*
      • \`⁅find⁆\`: *380*   🟢 ▲ 27%
      • \`⁅hero⁆\`: *120*   🔴 ▼ 20%
      *👆 Top actions*
      • \`⁅call⁆\`: *40*   🔴 ▼ 20%
      • \`⁅call-drug-service⁆\`: *9*   🆕 new
      • \`⁅about⁆\`: *2*   🆕 new
      *🚨 Top errors*
      • \`⁅location-denied⁆\`: *10*   🔴 ▲ 67%
      • \`⁅location-unavailable⁆\`: *2*   🔴 new
      Visitors are summed across the tool's pages, so someone who views more than one page may be counted more than once."
    `);
  });

  it("shows a clear empty state for a tool with no events", () => {
    const message = formatToolStats(LAST_WEEK, {
      tool: tool("bank-holidays"),
      current: { ...quiet, visitors: 75 },
      previous: { ...quiet, visitors: 60 },
    });
    expect(message.text).toBe(
      "🧰 Check bank holiday dates · Last week: 75 visitors, no tool events yet",
    );
    expect(render(message)).toContain(
      "*75*   🟢 ▲ 25%\n💤 No tool events yet in this period. The period before: 0 results, 0 step views.",
    );
    expect(render(message)).not.toContain("Errors");
  });

  it("adds the water outage alert sign-up funnel", () => {
    const water: ToolPeriod = {
      ...quiet,
      events: {
        results: 30,
        noResultRate: null,
        topAction: { action: "subscribe-submit", count: 8 },
        errors: 0,
        errorRate: 0,
      },
      actions: rows({ "subscribe-submit": 8 }),
    };
    const text = render(
      formatToolStats(LAST_WEEK, {
        tool: tool("water-outages"),
        current: {
          ...water,
          waterAlerts: { submitted: 8, sent: 7, confirmed: 5, unsubscribed: 1 },
        },
        previous: {
          ...water,
          waterAlerts: { submitted: 4, sent: 4, confirmed: 4, unsubscribed: 0 },
        },
      }),
    );
    expect(text).toContain(
      [
        "*🔔 Outage alert sign-ups*",
        "*✍️ Submitted*\n*8*   🟢 ▲ 100%",
        "*📧 Emails sent*\n*7*   🟢 ▲ 75%",
        "*✅ Confirmed*\n*5*   🟢 ▲ 25%",
        "*👋 Unsubscribed*\n*1*   🔴 new",
      ].join("\n"),
    );
    expect(text).not.toContain("No results");
    expect(text).not.toContain("Top errors");
  });

  it("says so when Umami's breakdowns could not be read", () => {
    const text = render(
      formatToolStats(LAST_WEEK, {
        tool: tool("water-outages"),
        current: {
          ...quiet,
          stepViews: 9,
          steps: undefined,
          actions: undefined,
          waterAlerts: null,
        },
        previous: { ...quiet, waterAlerts: null },
      }),
    );
    expect(text).toContain(
      "*👣 Views of each step*\nCouldn't read the breakdown from Umami.",
    );
    expect(text).toContain(
      "*👆 Top actions*\nCouldn't read the breakdown from Umami.",
    );
    expect(text).toContain("Couldn't read the sign-ups from Umami.");
  });

  it("shows no change against a period whose breakdown couldn't be read", () => {
    const text = render(
      formatToolStats(LAST_WEEK, {
        tool: tool("crop-over-permits"),
        current: { ...quiet, stepViews: 4, steps: rows({ "q-event": 4 }) },
        previous: { ...quiet, stepViews: 9, steps: undefined },
      }),
    );
    expect(text).toContain("*👣 Views of each step*\n• `⁅q-event⁆`: *4*\n");
  });

  it("never lets event data sent by a stranger mention, link or format", () => {
    const message = formatToolStats(LAST_WEEK, {
      tool: tool("crop-over-permits"),
      current: {
        ...quiet,
        stepViews: 3,
        steps: rows({ "x`<!channel> <https://evil.example|click> *bold*": 3 }),
      },
      previous: quiet,
    });
    const steps = (message.blocks as Record<string, any>[]).find((b) =>
      b.text?.text?.startsWith("*👣 Views"),
    )!;
    expect(steps.text.verbatim).toBe(true);
    expect(steps.text.text).toContain(
      `• \`${FSI}x&lt;!channel&gt; &lt;https://evil.example|click&gt; bold${PDI}\`: *3*`,
    );
  });

  it("isolates right-to-left codes, so the count and change stay after them", () => {
    const arabic = "ابحث";
    const message = formatToolStats(LAST_WEEK, {
      tool: tool("crop-over-permits"),
      current: { ...quiet, stepViews: 6, steps: rows({ [arabic]: 6 }) },
      previous: { ...quiet, stepViews: 4, steps: rows({ [arabic]: 4 }) },
    });
    const steps = (message.blocks as Record<string, any>[]).find((b) =>
      b.text?.text?.startsWith("*👣 Views"),
    )!;
    expect(steps.text.text.split("\n")[1]).toBe(
      `• \`${FSI}${arabic}${PDI}\`: *6*   🟢 ▲ 50%`,
    );
  });

  it("shows one placeholder row for codes with nothing left to show", () => {
    const text = render(
      formatToolStats(LAST_WEEK, {
        tool: tool("crop-over-permits"),
        current: {
          ...quiet,
          stepViews: 6,
          steps: rows({ [ZWSP]: 3, "**__": 2, "(blank)": 1 }),
        },
        previous: quiet,
      }),
    );
    expect(text).toContain(
      "*👣 Views of each step*\n• _(blank)_: *5*   🆕 new\n• `⁅(blank)⁆`: *1*   🆕 new\n",
    );
  });
});

describe("formatToolsSummary", () => {
  const tool = (id: string) => TOOLS.find((t) => t.id === id)!;
  const events = (
    results: number,
    errors: number,
    noResultRate: number | null = null,
  ): ToolTotals["events"] => ({
    results,
    noResultRate,
    topAction: null,
    errors,
    errorRate: results + errors ? errors / (results + errors) : null,
  });

  it("puts each tool on one line, with or without events", () => {
    const message = formatToolsSummary(LAST_WEEK, {
      tools: [
        {
          tool: tool("pharmacy-finder"),
          current: { visitors: 420, events: events(300, 12, 0.104) },
          previous: { visitors: 400, events: events(250, 6, 0.2) },
        },
        {
          // Its first events this period.
          tool: tool("severance-calculator"),
          current: { visitors: 90, events: events(40, 0, 0.25) },
          previous: { visitors: 90, events: null },
        },
        {
          // Its outcomes couldn't be read or trusted: a dash, as on the dashboard.
          tool: tool("shelter-finder"),
          current: { visitors: 30, events: events(10, 0) },
          previous: { visitors: 20, events: events(5, 1, 0.4) },
        },
        {
          // Actions only: no results or errors, so no error rate.
          tool: tool("crop-over-permits"),
          current: { visitors: 60, events: events(0, 0) },
          previous: { visitors: 0, events: null },
        },
        {
          tool: tool("bank-holidays"),
          current: { visitors: 75, events: null },
          previous: { visitors: 60, events: null },
        },
        {
          // Stopped sending events (only errors before): not the same as never set up.
          tool: tool("water-outages"),
          current: { visitors: 50, events: null },
          previous: { visitors: 40, events: events(0, 3) },
        },
      ],
    });
    expect(message.text).toBe(
      "🧰 Tools · Last week: 725 visitors, 350 results",
    );
    expect(render(message)).toMatchInlineSnapshot(`
      "🧰 Tools · Last week
      26 Oct – 1 Nov, compared with 19 Oct – 25 Oct
      *Find an open pharmacy* (\`pharmacy-finder\`): 👥 *420* visitors 🟢 ▲ 5% · ✅ *300* results 🟢 ▲ 20% · 🚫 *10.4%* no results 🟢 ▼ 10 pts · ⚠️ *12* errors (3.8%) 🔴 ▲ 100%
      *Find out how much severance you are owed* (\`severance-calculator\`): 👥 *90* visitors ⚪ no change · ✅ *40* results 🆕 new · 🚫 *25%* not eligible · ⚠️ *0* errors (0%) ⚪ no change
      *Find an emergency shelter* (\`shelter-finder\`): 👥 *30* visitors 🟢 ▲ 50% · ✅ *10* results 🟢 ▲ 100% · 🚫 *–* no results · ⚠️ *0* errors (0%) 🟢 ▼ 100%
      *Find the permits you need for a Crop Over event* (\`crop-over-permits\`): 👥 *60* visitors 🆕 new · ✅ *0* results ⚪ no change · ⚠️ *0* errors ⚪ no change
      *Check bank holiday dates* (\`bank-holidays\`): 👥 *75* visitors 🟢 ▲ 25% · 💤 no tool events yet
      *Check for water outages in your area* (\`water-outages\`): 👥 *50* visitors 🟢 ▲ 25% · 💤 no tool events this period (it sent some the period before)
      Visitors are summed across each tool's pages, so someone who views more than one page may be counted more than once. The no-result rate is the share of results where the visitor found nothing or was not eligible; tools without such a result have no rate. The error rate in brackets is errors ÷ (results + errors)."
    `);
  });
});

describe("countHandOffs", () => {
  it("sums packed, short-coded and plain names per website", () => {
    const landing = [
      { x: "passport-renewal:page-service-view", y: 40 },
      // A long form ID's hashed key and short code (#2682).
      { x: "abc123:psvw", y: 5 },
      { x: "passport-renewal:page-start-view", y: 30 },
      { x: "abc123:pstvw", y: 2 },
      { x: "start-click", y: 25 },
      { x: "search-submit", y: 99 },
      // form-start only counts on the forms website.
      { x: "passport-renewal:form-start", y: 1000 },
    ];
    const forms = [
      { x: "passport-renewal:form-start", y: 20 },
      { x: "abc123:fstrt", y: 3 },
      { x: "passport-renewal:form-submit", y: 15 },
      { x: "start-click", y: 1000 },
    ];
    expect(countHandOffs(landing, forms)).toEqual({
      "page-service-view": 45,
      "page-start-view": 32,
      "start-click": 25,
      "form-start": 23,
    });
  });
});

describe("formatJourneyStats", () => {
  const current = {
    "page-service-view": 1200,
    "page-start-view": 600,
    "start-click": 450,
    "form-start": 400,
  };
  const previous = {
    "page-service-view": 1000,
    "page-start-view": 600,
    "start-click": 500,
    "form-start": 0,
  };

  it("shows the top five paths with their share, and the hand-off counts, for a normal week", () => {
    const path = (count: number, ...items: string[]) => ({ items, count });
    const paths = shapeJourneyList([
      path(30, "/", "/travel/renew-passport", "/travel/renew-passport/start"),
      path(20, "/", "/search", "/health/find-a-pharmacy"),
      path(15, "/travel/renew-passport", "/travel/renew-passport/start"),
      path(10, "/", "/family/get-birth-certificate"),
      path(10, "/about", "/"),
      path(5, "/", "/contact"),
      path(50, "/"), // a bounce: not a journey
    ]);
    expect(paths).toHaveLength(6);

    const message = formatJourneyStats(LAST_WEEK, {
      paths,
      current,
      previous,
    });

    expect(message.text).toBe(
      "🧭 Landing journeys · Last week: 1,200 service page views, 400 forms started",
    );
    expect(render(message)).toMatchInlineSnapshot(`
      "🧭 Landing journeys · Last week
      26 Oct – 1 Nov, compared with 19 Oct – 25 Oct
      *🛤️ Most common journeys on landing*
      • ⁅Home⁆ → ⁅Renew passport⁆ → ⁅Start⁆: *33.3%* (30)
      • ⁅Home⁆ → ⁅Search⁆ → ⁅Find a pharmacy⁆: *22.2%* (20)
      • ⁅Renew passport⁆ → ⁅Start⁆: *16.7%* (15)
      • ⁅Home⁆ → ⁅Get birth certificate⁆: *11.1%* (10)
      • ⁅About⁆ → ⁅Home⁆: *11.1%* (10)
      ---
      *🔀 From landing to forms*
      *📄 Service page views*
      *1,200*   🟢 ▲ 20%
      *🚪 Start page views*
      *600*   ⚪ no change
      *👆 Start now clicks*
      *450*   🔴 ▼ 10%
      *📝 Forms started*
      *400*   🆕 new
      ℹ️ These are event counts. Landing and forms are separate Umami websites, so they are four separate counts, not a funnel. The full journey from landing to forms is only in \`/journey\` in Datadog."
    `);
  });

  it("says so when there are no journeys", () => {
    const message = formatJourneyStats(LAST_WEEK, {
      paths: [],
      current,
      previous,
    });
    const text = render(message);
    expect(text).toContain(
      "💤 No journeys of two or more pages on landing in this period.",
    );
    expect(text).toContain("*📝 Forms started*\n*400*   🆕 new");
    expect(text).toContain("not a funnel");
  });

  it("keeps hostile page paths inert: no mentions, links or formatting", () => {
    const paths = shapeJourneyList([
      {
        items: [
          "/<!channel>",
          "/x/<mailto:a@evil.example|Click here>",
          "/`code` *bold* & more",
          "/" + "a".repeat(200),
        ],
        count: 3,
      },
    ]);
    const message = formatJourneyStats(LAST_WEEK, {
      paths,
      current,
      previous,
    });
    const journeys = (message.blocks as Record<string, any>[])[2];
    expect(journeys.text.verbatim).toBe(true);
    const [title, line, ...rest] = journeys.text.text.split("\n");
    expect(title).toBe("*🛤️ Most common journeys on landing*");
    expect(rest).toEqual([]);
    expect(line).toBe(
      `• ${FSI}!channel${PDI} → ${FSI}mailto:a@evil.example|Click here${PDI} → ${FSI}code bold more${PDI} → ${FSI}A` +
        "a".repeat(78) +
        `…${PDI}: *100%* (3)`,
    );
  });

  it("keeps the journeys under Slack's 3,000-character section limit", () => {
    // shapeJourneyList gives up to 12 paths; each step is as long as
    // plainSlackText allows, and the &s would grow fivefold if escaped.
    const step = (n: number) => "/" + n + "&".repeat(20) + "a".repeat(100);
    const paths = shapeJourneyList(
      Array.from({ length: 12 }, (_, n) => ({
        items: [1, 2, 3, 4].map((k) => step(n * 10 + k)),
        count: 10,
      })),
    );
    expect(paths).toHaveLength(12);
    const message = formatJourneyStats(LAST_WEEK, {
      paths,
      current,
      previous,
    });
    const journeys = (message.blocks as Record<string, any>[])[2];
    expect(journeys.text.text.split("\n")).toHaveLength(6);
    expect(journeys.text.text.length).toBeLessThanOrEqual(3000);
  });
});
