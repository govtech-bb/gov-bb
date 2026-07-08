import {
  buildJourneys,
  buildFunnels,
  aggregateSessions,
  type SessionWithActivity,
} from "./sessions";

// Helper: a pageview activity row.
const pv = (path: string, at: string) => ({ createdAt: at, urlPath: path });
// Helper: a custom-event activity row (step carried in ?step=).
const ev = (name: string, at: string, step?: string) => ({
  createdAt: at,
  urlPath: "/forms/f",
  urlQuery: step ? `step=${step}` : undefined,
  eventName: name,
});

describe("buildJourneys", () => {
  it("reconstructs ordered, de-duplicated page journeys and splits events out", () => {
    const sessions: SessionWithActivity[] = [
      {
        session: { id: "s1", country: "BB", device: "mobile" },
        activity: [
          pv("/", "2026-07-01T10:00:00Z"),
          pv("/", "2026-07-01T10:00:05Z"), // reload — collapsed
          pv("/services", "2026-07-01T10:00:10Z"),
          ev("f:form-start", "2026-07-01T10:00:12Z"),
        ],
      },
    ];
    const [j] = buildJourneys(sessions);
    expect(j.pages).toEqual(["/", "/services"]); // dedup collapse
    expect(j.events.map((e) => e.name)).toEqual(["f:form-start"]);
    expect(j.bounce).toBe(false);
    expect(j.device).toBe("mobile");
  });

  it("marks single-page sessions as bounces", () => {
    const [j] = buildJourneys([
      { session: { id: "s" }, activity: [pv("/", "2026-07-01T10:00:00Z")] },
    ]);
    expect(j.bounce).toBe(true);
  });
});

describe("buildFunnels — distinct sessions (#1914)", () => {
  it("counts a step once even if its event fires multiple times in a session", () => {
    const sessions: SessionWithActivity[] = [
      {
        session: { id: "s1" },
        activity: [
          ev("byac:form-start", "2026-07-01T10:00:00Z"),
          ev("byac:form-step-one", "2026-07-01T10:00:01Z", "about-you"),
          ev("byac:form-step-one", "2026-07-01T10:00:09Z", "about-you"), // back + re-advance
          ev("byac:form-submit", "2026-07-01T10:05:00Z"),
        ],
      },
    ];
    const [f] = buildFunnels(buildJourneys(sessions));
    expect(f.started).toBe(1);
    expect(f.submitted).toBe(1);
    const step = f.steps.find((s) => s.slug === "about-you")!;
    expect(step.completed).toBe(1); // distinct session, not 2 events
    expect(f.completion).toBe(1);
  });

  it("orders steps by mean positional rank across sessions", () => {
    const mk = (id: string): SessionWithActivity => ({
      session: { id },
      activity: [
        ev("f:form-start", "2026-07-01T10:00:00Z"),
        ev("f:form-step-one", "2026-07-01T10:00:01Z", "a"),
        ev("f:form-step-two", "2026-07-01T10:00:02Z", "b"),
        ev("f:form-step-three", "2026-07-01T10:00:03Z", "c"),
      ],
    });
    const [f] = buildFunnels(buildJourneys([mk("s1"), mk("s2")]));
    expect(f.steps.map((s) => s.slug)).toEqual(["a", "b", "c"]);
  });
});

describe("buildFunnels — reached vs completed (#1915)", () => {
  it("distinguishes sessions that reached a step from those that completed it", () => {
    const sessions: SessionWithActivity[] = [
      {
        // reached step, then abandoned (no advance)
        session: { id: "s1" },
        activity: [
          ev("f:form-start", "2026-07-01T10:00:00Z"),
          ev("f:form-step-view", "2026-07-01T10:00:01Z", "about-you"),
        ],
      },
      {
        // reached AND completed the step
        session: { id: "s2" },
        activity: [
          ev("f:form-start", "2026-07-01T10:00:00Z"),
          ev("f:form-step-view", "2026-07-01T10:00:01Z", "about-you"),
          ev("f:form-step-one", "2026-07-01T10:00:05Z", "about-you"),
        ],
      },
    ];
    const [f] = buildFunnels(buildJourneys(sessions));
    const step = f.steps.find((s) => s.slug === "about-you")!;
    expect(step.reached).toBe(2);
    expect(step.completed).toBe(1);
    expect(step.abandonedInStep).toBe(1); // s1 reached but didn't finish
  });
});

describe("buildFunnels — submit errors (#1916)", () => {
  it("tracks submit errors as a first-class metric and computes a rate", () => {
    const sessions: SessionWithActivity[] = [
      {
        session: { id: "ok" },
        activity: [
          ev("f:form-start", "2026-07-01T10:00:00Z"),
          ev("f:form-submit", "2026-07-01T10:01:00Z"),
        ],
      },
      {
        session: { id: "err" },
        activity: [
          ev("f:form-start", "2026-07-01T10:00:00Z"),
          ev("f:form-submit-error", "2026-07-01T10:01:00Z"),
        ],
      },
    ];
    const [f] = buildFunnels(buildJourneys(sessions));
    expect(f.submitted).toBe(1);
    expect(f.friction.submitErrors).toBe(1);
    expect(f.submitErrorRate).toBeCloseTo(0.5, 5); // 1 error / (1 ok + 1 error)
  });
});

describe("aggregateSessions — consolidation (flow / entry / exit / mix)", () => {
  const sessions: SessionWithActivity[] = [
    {
      session: { id: "s1", country: "BB", device: "mobile" },
      activity: [
        pv("/", "2026-07-01T10:00:00Z"),
        pv("/services", "2026-07-01T10:00:10Z"),
        pv("/forms/byac", "2026-07-01T10:00:20Z"),
      ],
    },
    {
      session: { id: "s2", country: "US", device: "desktop" },
      activity: [
        pv("/", "2026-07-01T10:00:00Z"),
        pv("/services", "2026-07-01T10:00:10Z"),
      ],
    },
    {
      session: { id: "s3", country: "BB", device: "mobile" },
      activity: [pv("/", "2026-07-01T10:00:00Z")], // bounce
    },
  ];

  const report = aggregateSessions(buildJourneys(sessions), {
    startAt: Date.parse("2026-06-01T00:00:00Z"),
    endAt: Date.parse("2026-07-01T00:00:00Z"),
  });

  it("computes session totals + bounce rate", () => {
    expect(report.totals.sessions).toBe(3);
    expect(report.totals.bounces).toBe(1);
    expect(report.totals.bounceRate).toBeCloseTo(1 / 3, 5);
  });

  it("ranks entry and exit pages", () => {
    expect(report.entries[0]).toEqual({ key: "/", count: 3 });
    const exitKeys = report.exits.map((e) => e.key);
    expect(exitKeys).toContain("/forms/byac");
    expect(exitKeys).toContain("/services");
    expect(exitKeys).toContain("/");
  });

  it("builds a layered flow graph (page transitions by depth)", () => {
    const d0 = report.flow.filter((l) => l.depth === 0);
    expect(d0.find((l) => l.from === "/" && l.to === "/services")!.count).toBe(
      2,
    );
    const d1 = report.flow.filter((l) => l.depth === 1);
    expect(
      d1.find((l) => l.from === "/services" && l.to === "/forms/byac")!.count,
    ).toBe(1);
  });

  it("aggregates device and country mix by session", () => {
    expect(report.devices.find((d) => d.key === "mobile")!.count).toBe(2);
    expect(report.countries.find((c) => c.key === "BB")!.count).toBe(2);
  });

  it("records the reporting window (freshness #1917 inputs)", () => {
    expect(report.window.days).toBe(30);
  });
});
