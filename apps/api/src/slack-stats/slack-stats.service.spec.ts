import type { ConfigService } from "@nestjs/config";
import type { FormDefinitionsService } from "@/forms/form-definitions/form-definitions.service";
import { Logger } from "@nestjs/common";
import { TOOLS, comparisonPeriods } from "@govtech-bb/umami-analytics";
import { SlackStatsService, slackResponseUrl } from "./slack-stats.service";

// A fake Umami client: funnel rows and event values keyed by event name, the
// same for every period unless a test overrides `funnels` per call.
const umami = vi.hoisted(() => ({
  stats: vi.fn(),
  reportFunnel: vi.fn(),
  eventDataValues: vi.fn(),
  metricsUrls: vi.fn(),
  metricsEvents: vi.fn(),
  reportJourney: vi.fn(),
}));
vi.mock("@govtech-bb/umami-analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@govtech-bb/umami-analytics")>()),
  UmamiClient: vi.fn(function () {
    return umami;
  }),
}));

const SLACK_URL = "https://hooks.slack.com/commands/T1/1/abc";
const NOW = new Date("2026-11-04T18:30:00Z");
const env: Record<string, string> = {
  UMAMI_API_KEY: "key",
  UMAMI_LANDING_WEBSITE_ID: "landing",
  UMAMI_FORMS_WEBSITE_ID: "forms",
};
const config = { get: (k: string) => env[k] } as unknown as ConfigService;

const formDefinitions = {
  findAll: vi.fn(),
  findByFormId: vi.fn(),
};

const funnel = (...visitors: number[]) =>
  visitors.map((v) => ({ type: "event", value: "", visitors: v }));

/** buildReply's output as one searchable string. */
async function reply(...args: Parameters<SlackStatsService["buildReply"]>) {
  const message = await service().buildReply(...args);
  return typeof message === "string" ? message : JSON.stringify(message.blocks);
}

function service() {
  return new SlackStatsService(
    config,
    formDefinitions as unknown as FormDefinitionsService,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  formDefinitions.findAll.mockResolvedValue([
    { formId: "passport-renewal", title: "Renew a passport" },
    { formId: "birth-certificate", title: "Birth certificate" },
  ]);
  umami.stats.mockResolvedValue({ visitors: 1000 });
  umami.eventDataValues.mockResolvedValue([]);
  umami.metricsUrls.mockResolvedValue([]);
  umami.metricsEvents.mockResolvedValue([]);
});

describe("SlackStatsService.isConfigured", () => {
  it("needs the API key and both website ids", () => {
    expect(service().isConfigured()).toBe(true);
    const saved = env.UMAMI_FORMS_WEBSITE_ID;
    delete env.UMAMI_FORMS_WEBSITE_ID;
    expect(service().isConfigured()).toBe(false);
    env.UMAMI_FORMS_WEBSITE_ID = saved;
  });
});

describe("SlackStatsService.buildReply — site-wide", () => {
  it("sums forms per period and ranks the biggest finish-rate drop", async () => {
    // Call order: current period (passport, birth), then previous period.
    umami.reportFunnel
      .mockResolvedValueOnce(funnel(100, 70, 40)) // passport now: 40%
      .mockResolvedValueOnce(funnel(0, 0, 0)) // birth now
      .mockResolvedValueOnce(funnel(100, 80, 60)) // passport before: 60%
      .mockResolvedValueOnce(funnel(50, 40, 30)); // birth before
    umami.eventDataValues.mockResolvedValue([{ value: 300, total: 2 }]);

    const text = await reply("/stats", "week", undefined, NOW);

    expect(text).toContain("*1,000*   ⚪ no change");
    expect(text).toContain("*10%*   🔴 ▼ 5 pts");
    expect(text).toContain("*40*   🔴 ▼ 56%");
    expect(text).toContain("*5m 00s*   ⚪ no change");
    expect(text).toContain("passport-renewal");
    // Durations are only fetched for forms someone finished (3 of 4 funnels).
    expect(umami.eventDataValues).toHaveBeenCalledTimes(3);
    expect(text).not.toContain("Dead ends");
  });

  it("counts dead ends with one event request per site per period", async () => {
    umami.reportFunnel.mockResolvedValue(funnel(0, 0, 0));
    umami.metricsEvents.mockImplementation(async (site: string) =>
      site === "landing"
        ? [{ x: "page-not-found", y: 6 }]
        : [
            { x: "passport-renewal:form-closed-view", y: 2 },
            { x: "birth-certificate:form-load-error", y: 5 },
          ],
    );

    const text = await reply("/stats", "week", undefined, NOW);

    expect(umami.metricsEvents.mock.calls.map(([site]) => site)).toEqual([
      "landing",
      "forms",
      "landing",
      "forms",
    ]);
    expect(text).toContain(
      "*🚧 Dead ends:* closed form *2* ⚪ no change · form didn't load *5* ⚪ no change · service unavailable *0* ⚪ no change · page not found *6* ⚪ no change · most on `birth-certificate` (5)",
    );
  });

  it("never puts an event name sent by a stranger into the reply", async () => {
    umami.reportFunnel.mockResolvedValue(funnel(0, 0, 0));
    umami.metricsEvents.mockImplementation(async (site: string) =>
      site === "landing"
        ? []
        : [
            {
              x: "x`<!channel> <evil.example|click> &amp;:fclsd",
              y: 9,
            },
          ],
    );

    const message = await service().buildReply(
      "/stats",
      "week",
      undefined,
      NOW,
    );
    const text = JSON.stringify(message);

    expect(text).toContain("closed form *9*");
    expect(text).not.toContain("most on");
    for (const hostile of ["<!channel>", "evil.example", "&amp;", "x`"]) {
      expect(text).not.toContain(hostile);
    }
  });

  it("counts a dead end that sits below more than 500 busier event names (#3819)", async () => {
    umami.reportFunnel.mockResolvedValue(funnel(0, 0, 0));
    // Like Umami: busiest first, cut at the limit (the client's default 500).
    const busier = Array.from({ length: 600 }, (_, i) => ({
      x: `form-${i}:form-step-view`,
      y: 1000 - i,
    }));
    umami.metricsEvents.mockImplementation(
      async (site: string, _range: unknown, limit = 500) =>
        site === "landing"
          ? []
          : [...busier, { x: "passport-renewal:form-closed-view", y: 1 }].slice(
              0,
              limit,
            ),
    );

    const text = await reply("/stats", "week", undefined, NOW);

    expect(text).toContain("closed form *1*");
  });
});

describe("SlackStatsService.buildReply — one tool", () => {
  /** Event values keyed `event.property`, plus `@tool` for a filtered read. */
  const events = (data: Record<string, { value: string; total: number }[]>) =>
    umami.eventDataValues.mockImplementation(
      async (
        _site: string,
        event: string,
        property: string,
        _range: unknown,
        where?: { property: string; equals: string },
      ) => data[`${event}.${property}${where ? `@${where.equals}` : ""}`] ?? [],
    );
  const reads = () =>
    umami.eventDataValues.mock.calls.map(
      ([site, event, property, , where]) =>
        `${site} ${event}.${property}${where ? `@${where.equals}` : ""}`,
    );

  it("reports a tool's events from landing, compared with the week before", async () => {
    umami.metricsUrls.mockResolvedValue([
      { x: "/business-trade/crop-over-permits", pageviews: 90, visitors: 60 },
      { x: "/business-trade/crop-over-permits/result", visitors: 25 },
      { x: "/business-trade/other", visitors: 999 },
    ]);
    events({
      "tool-result.tool": [
        { value: "crop-over-permits", total: 40 },
        { value: "pharmacy-finder", total: 500 },
      ],
      "tool-action.tool": [{ value: "crop-over-permits", total: 6 }],
      "tool-error.tool": [{ value: "crop-over-permits", total: 3 }],
      "tool-step-view.tool": [{ value: "crop-over-permits", total: 120 }],
      "tool-result.outcome@crop-over-permits": [
        { value: "checklist", total: 40 },
      ],
      "tool-action.action@crop-over-permits": [
        { value: "apply-online", total: 6 },
      ],
      "tool-step-view.step@crop-over-permits": [
        { value: "q-event", total: 70 },
        { value: "q-venue", total: 50 },
      ],
      "tool-error.error@crop-over-permits": [{ value: "required", total: 3 }],
    });

    const text = await reply("/stats", "week", "crop-over-permits", NOW);

    expect(text).toContain(
      "🧰 Find the permits you need for a Crop Over event",
    );
    expect(text).toContain("*👥 Visitors to the tool*\\n*85*   ⚪ no change");
    expect(text).toContain("*✅ Results*\\n*40*   ⚪ no change");
    expect(text).toContain("• `q-event`: *70*");
    expect(text).toContain("• `apply-online`: *6*");
    expect(text).toContain("• `required`: *3*");
    expect(text).not.toContain("No results");
    expect(text).not.toContain("sign-ups");
    // The same reads for each period, one at a time, and no form lookups.
    const week = [
      "landing tool-result.tool",
      "landing tool-action.tool",
      "landing tool-error.tool",
      "landing tool-result.outcome@crop-over-permits",
      "landing tool-action.action@crop-over-permits",
      "landing tool-step-view.tool",
      "landing tool-step-view.step@crop-over-permits",
      "landing tool-error.error@crop-over-permits",
    ];
    expect(reads()).toEqual([...week, ...week]);
    expect(umami.metricsUrls).toHaveBeenCalledTimes(2);
    expect(formDefinitions.findAll).not.toHaveBeenCalled();
    expect(umami.reportFunnel).not.toHaveBeenCalled();
  });

  it("shows the empty state for a tool with no events, with no breakdown reads", async () => {
    const text = await reply("/stats", "week", "pharmacy-finder", NOW);

    expect(text).toContain("💤 No tool events yet in this period.");
    expect(umami.eventDataValues).toHaveBeenCalledTimes(8);
    expect(reads().some((r) => r.includes("@"))).toBe(false);
  });

  it("adds the alert sign-up funnel for water outages", async () => {
    events({
      "tool-result.tool": [{ value: "water-outages", total: 20 }],
      "tool-action.tool": [{ value: "water-outages", total: 9 }],
      "tool-result.outcome@water-outages": [
        { value: "parish-chosen", total: 10 },
        { value: "subscribe-sent", total: 6 },
        { value: "confirmed", total: 3 },
        { value: "unsubscribed", total: 1 },
      ],
      "tool-action.action@water-outages": [
        { value: "subscribe-submit", total: 7 },
        { value: "open-notice", total: 2 },
      ],
    });

    const text = await reply("/stats", "month", "water-outages", NOW);

    expect(text).toContain("*🔔 Outage alert sign-ups*");
    expect(text).toContain("*✍️ Submitted*\\n*7*   ⚪ no change");
    expect(text).toContain("*📧 Emails sent*\\n*6*");
    expect(text).toContain("*✅ Confirmed*\\n*3*");
    expect(text).toContain("*👋 Unsubscribed*\\n*1*");
  });

  it("shows a dash, not a wrong number, when Umami ignores the tool filter", async () => {
    events({
      "tool-result.tool": [{ value: "shelter-finder", total: 10 }],
      // Every tool's outcomes: more than the shelter finder's own 10.
      "tool-result.outcome@shelter-finder": [
        { value: "no-results", total: 400 },
      ],
    });

    const text = await reply("/stats", "week", "shelter-finder", NOW);

    expect(text).toContain("*🚫 No results*\\n*–*");
  });

  it("says a breakdown couldn't be read when a filtered read fails", async () => {
    events({
      "tool-step-view.tool": [{ value: "crop-over-permits", total: 5 }],
      "tool-error.tool": [{ value: "crop-over-permits", total: 2 }],
    });
    const counts = umami.eventDataValues.getMockImplementation()!;
    umami.eventDataValues.mockImplementation(async (...args: unknown[]) => {
      if (args[4]) throw new Error("Umami 500");
      return counts(...(args as Parameters<typeof counts>));
    });

    const text = await reply("/stats", "week", "crop-over-permits", NOW);

    expect(text).toContain(
      "*👣 Views of each step*\\nCouldn't read the breakdown from Umami.",
    );
    expect(text).toContain(
      "*🚨 Top errors*\\nCouldn't read the breakdown from Umami.",
    );
  });

  it("apologises rather than show no events when Umami fails", async () => {
    umami.eventDataValues.mockRejectedValue(new Error("Umami 401"));
    await expect(
      reply("/stats", "week", "shelter-finder", NOW),
    ).rejects.toThrow("Umami 401");
  });

  it("suggests tool IDs and topics for an unknown word", async () => {
    expect(await reply("/stats", "week", "pharmacy", NOW)).toBe(
      "🤔 No form or tool with the ID `pharmacy`. Did you mean `pharmacy-finder`?",
    );
    expect(await reply("/stats", "week", "journey", NOW)).toContain(
      "`journeys`",
    );
    // A topic with no reply yet doesn't suggest itself.
    expect(await reply("/stats", "week", "search", NOW)).not.toContain(
      "Did you mean",
    );
  });
});

describe("SlackStatsService.buildReply — all tools", () => {
  const reads = () =>
    umami.eventDataValues.mock.calls.map(
      ([site, event, property, , where]) =>
        `${site} ${event}.${property}${where ? `@${where.equals}` : ""}`,
    );

  it("lists every tool from one read per event, with the dashboard's numbers", async () => {
    // This period, then the period before.
    umami.metricsUrls.mockResolvedValueOnce([
      {
        x: "/health-and-emergency-services/find-an-open-pharmacy",
        visitors: 300,
      },
      {
        x: "/health-and-emergency-services/find-an-open-pharmacy/find",
        visitors: 120,
      },
      { x: "/business-trade/crop-over-permits", visitors: 60 },
    ]);
    umami.metricsUrls.mockResolvedValueOnce([
      {
        x: "/health-and-emergency-services/find-an-open-pharmacy",
        visitors: 400,
      },
    ]);
    // Event values keyed `event.property`, plus `@tool` for a filtered read.
    const data: Record<string, { value: string; total: number }[]> = {
      "tool-result.tool": [
        { value: "pharmacy-finder", total: 250 },
        { value: "crop-over-permits", total: 40 },
      ],
      "tool-action.tool": [{ value: "pharmacy-finder", total: 9 }],
      "tool-error.tool": [{ value: "pharmacy-finder", total: 10 }],
      "tool-result.outcome@pharmacy-finder": [
        { value: "found", total: 225 },
        { value: "no-results", total: 25 },
      ],
    };
    umami.eventDataValues.mockImplementation(
      async (
        _site: string,
        event: string,
        property: string,
        _range: unknown,
        where?: { equals: string },
      ) => data[`${event}.${property}${where ? `@${where.equals}` : ""}`] ?? [],
    );

    const text = await reply("/stats", "week", "tools", NOW);

    for (const { id } of TOOLS) expect(text).toContain(`(\`${id}\`)`);
    expect(text).toContain(
      "👥 *420* visitors 🟢 ▲ 5% · ✅ *250* results ⚪ no change · 🚫 *10%* no results ⚪ no change · ⚠️ *10* errors (3.8%) ⚪ no change",
    );
    expect(text).toContain(
      "(`crop-over-permits`): 👥 *60* visitors 🆕 new · ✅ *40* results",
    );
    expect(text).toContain(
      "(`bank-holidays`): 👥 *0* visitors ⚪ no change · 💤 no tool events yet",
    );
    // Outcomes only for a tool with a no-result rate that sent results.
    const period = [
      "landing tool-result.tool",
      "landing tool-action.tool",
      "landing tool-error.tool",
      "landing tool-result.outcome@pharmacy-finder",
    ];
    expect(reads()).toEqual([...period, ...period]);
    expect(umami.metricsUrls).toHaveBeenCalledTimes(2);
    expect(formDefinitions.findAll).not.toHaveBeenCalled();
  });

  it("apologises rather than show no events when Umami fails", async () => {
    umami.eventDataValues.mockRejectedValue(new Error("Umami 401"));
    await expect(reply("/stats", "week", "tools", NOW)).rejects.toThrow(
      "Umami 401",
    );
  });
});

describe("SlackStatsService.buildReply — chat", () => {
  it("reads the landing chat events for both periods, and no form", async () => {
    umami.eventDataValues.mockImplementation(
      async (_site: string, event: string) =>
        event === "chat-submit"
          ? [{ value: "home", total: 12 }]
          : [{ value: "How do I renew my passport?", total: 3 }],
    );

    const text = await reply("/stats", "week", "chat", NOW);

    expect(text).toContain("💬 Chat on landing · Last week");
    expect(text).toContain("• `home`: *12*   ⚪ no change");
    expect(text).toContain("• How do I renew my passport?: *3*");
    expect(text).toContain("Answer outcomes");
    expect(umami.eventDataValues.mock.calls.map((c) => c.slice(0, 3))).toEqual([
      ["landing", "chat-submit", "source"],
      ["landing", "chat-suggestion", "question"],
      ["landing", "chat-submit", "source"],
      ["landing", "chat-suggestion", "question"],
    ]);
    expect(umami.reportFunnel).not.toHaveBeenCalled();
    expect(formDefinitions.findAll).not.toHaveBeenCalled();
  });

  it("shows the empty state when Umami has no chat events", async () => {
    const text = await reply("/stats", "today", "chat", NOW);
    expect(text).toContain("💤 Nobody asked a chat question");
  });

  it("apologises rather than show zero use when Umami fails", async () => {
    umami.eventDataValues.mockRejectedValue(new Error("Umami 401"));
    await expect(reply("/stats", "week", "chat", NOW)).rejects.toThrow(
      "Umami 401",
    );
  });
});

describe("SlackStatsService.buildReply — journeys", () => {
  it("shows the dashboard's top paths and both websites' hand-offs, without the forms", async () => {
    umami.reportJourney.mockResolvedValue([
      { items: ["/", "/travel/renew-passport", null, null], count: 30 },
      { items: ["/", null, null, null], count: 99 },
    ]);
    umami.metricsEvents.mockImplementation(async (site: string) =>
      site === "landing"
        ? [
            { x: "passport-renewal:page-service-view", y: 12 },
            { x: "start-click", y: 4 },
          ]
        : [{ x: "passport-renewal:form-start", y: 3 }],
    );

    const text = await reply("/stats", "week", "journeys", NOW);

    expect(text).toContain("🧭 Landing journeys · Last week");
    expect(text).toContain("• Home → Renew passport: *100%* (30)");
    expect(text).toContain("*📝 Forms started*\\n*3*   ⚪ no change");
    expect(text).toContain("not a funnel");
    const lastWeek = comparisonPeriods("week", "America/Barbados", NOW).current;
    expect(umami.reportJourney.mock.calls).toEqual([
      ["landing", { steps: 4, range: lastWeek }],
    ]);
    expect(umami.metricsEvents.mock.calls.map((c) => c[0])).toEqual([
      "landing",
      "forms",
      "landing",
      "forms",
    ]);
    expect(umami.metricsEvents.mock.calls[0].slice(1)).toEqual([
      lastWeek,
      10_000,
    ]);
    expect(formDefinitions.findAll).not.toHaveBeenCalled();
    expect(umami.reportFunnel).not.toHaveBeenCalled();
  });

  it("fails rather than show zero journeys when Umami fails", async () => {
    umami.reportJourney.mockRejectedValue(new Error("Umami 401"));
    await expect(reply("/stats", "week", "journeys", NOW)).rejects.toThrow(
      "Umami 401",
    );
  });

  it("fails rather than show zero hand-offs when an event list fails", async () => {
    umami.reportJourney.mockResolvedValue([]);
    umami.metricsEvents.mockRejectedValue(new Error("Umami 500"));
    await expect(reply("/stats", "week", "journeys", NOW)).rejects.toThrow(
      "Umami 500",
    );
  });
});

describe("SlackStatsService.buildReply — one form", () => {
  it("suggests similar ids for an unknown form", async () => {
    const text = await reply("/stats", "week", "passport", NOW);
    expect(text).toBe(
      "🤔 No form or tool with the ID `passport`. Did you mean `passport-renewal`?",
    );
  });

  it("explains form ids when nothing is similar", async () => {
    const text = await reply("/stats", "week", "zzz", NOW);
    expect(text).toContain("Form IDs are the part of the form's address");
  });

  it("shows headline numbers, step views and top errors", async () => {
    formDefinitions.findByFormId.mockResolvedValue({
      title: "Renew a passport",
      steps: [
        {
          stepId: "details",
          title: "Your details",
          elements: [{ fieldId: "name", label: "Full name" }],
        },
        { stepId: "photo", title: "Upload photo" },
      ],
    });
    umami.reportFunnel.mockImplementation(
      async (_site: string, { steps }: { steps: { type: string }[] }) =>
        steps[0].type === "path" ? funnel(500, 100) : funnel(100, 70, 50),
    );
    umami.eventDataValues.mockImplementation(
      async (_site: string, event: string, property: string) => {
        if (property === "step")
          return [
            { value: "details", total: 100 },
            { value: "photo", total: 60 },
          ];
        if (property === "fieldErrors")
          return [{ value: "name:required", total: 9 }];
        if (property === "errors") return [{ value: "network", total: 4 }];
        if (event.endsWith("form-submit")) return [{ value: 120, total: 1 }];
        return [];
      },
    );

    const text = await reply("/stats", "today", "passport-renewal", NOW);

    expect(text).toContain("📝 Renew a passport");
    expect(text).toContain("`passport-renewal` · *Today so far*");
    expect(text).toContain("*20%*   ⚪ no change");
    expect(text).toContain("Upload photo  ███████░░░░░   60");
    expect(text).toContain("• Full name: *9*\\n• submit failed: network: *4*");
  });

  it("falls back to the field id and survives missing event data", async () => {
    formDefinitions.findByFormId.mockResolvedValue({
      title: "Renew a passport",
      steps: [
        {
          stepId: "details",
          title: "Your details",
          elements: [{ fieldId: "dob" }],
        },
      ],
    });
    umami.reportFunnel.mockResolvedValue([]);
    umami.eventDataValues.mockImplementation(
      async (_site: string, _event: string, property: string) => {
        if (property === "fieldErrors")
          return [{ value: "dob:date", total: 2 }];
        throw new Error("Umami 404");
      },
    );

    const text = await reply("/stats", "month", "passport-renewal", NOW);

    expect(text).toContain("• dob: *2*");
    expect(text).toContain("Your details  ░░░░░░░░░░░░  0");
  });
});

describe("slackResponseUrl", () => {
  it("keeps a Slack slash command response URL", () => {
    expect(slackResponseUrl(SLACK_URL)).toBe(SLACK_URL);
  });

  it.each([
    "",
    "not a url",
    "http://hooks.slack.com/commands/T1/1/abc",
    "https://hooks.slack.com.evil.example/commands/T1/1/abc",
    "https://evil.example/hooks.slack.com/commands/T1/1/abc",
    "https://hooks.slack.com:8443/commands/T1/1/abc",
    "https://user:pass@hooks.slack.com/commands/T1/1/abc",
    "https://hooks.slack.com/commands/T1/1/abc?x=1",
    "https://hooks.slack.com/commands/T1/1/abc/extra",
    "https://hooks.slack.com/commands/T1/1/%2e%2e",
    "https://hooks.slack.com/services/T1/B1/abc",
    "https://169.254.169.254/latest/meta-data/",
  ])("refuses %j", (raw) => {
    expect(slackResponseUrl(raw)).toBeNull();
  });
});

describe("SlackStatsService.respond", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const posted = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

  it("posts the reply to the response url", async () => {
    await service().respond(
      { command: "/stats", period: "week", formId: "zzz" },
      SLACK_URL,
      NOW,
    );
    expect(fetchMock.mock.calls[0][0]).toBe(SLACK_URL);
    expect(posted()).toMatchObject({ response_type: "ephemeral" });
    expect(posted().text).toContain("No form or tool with the ID `zzz`");
  });

  it("runs one reply at a time, so two commands can't share the rate limit", async () => {
    let releaseFirst!: () => void;
    formDefinitions.findAll
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = () => resolve([]);
          }),
      )
      .mockRejectedValueOnce(new Error("Umami 429"));
    const s = service();
    const first = s.respond(
      { command: "/stats", period: "week", formId: "zzz" },
      SLACK_URL,
      NOW,
    );
    const second = s.respond(
      { command: "/stats", period: "week" },
      SLACK_URL,
      NOW,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(formDefinitions.findAll).toHaveBeenCalledTimes(1);

    releaseFirst();
    await first;
    await second;
    expect(formDefinitions.findAll).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // A failed reply doesn't stall the queue.
    await s.respond(
      { command: "/stats", period: "week", formId: "zzz" },
      SLACK_URL,
      NOW,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("posts an apology when Umami fails", async () => {
    umami.stats.mockRejectedValue(new Error("Umami 500"));
    umami.reportFunnel.mockResolvedValue([]);
    await service().respond(
      { command: "/stats", period: "week" },
      SLACK_URL,
      NOW,
    );
    expect(posted().text).toContain("couldn't get the stats");
  });

  it("logs a non-string failure and never throws when Slack is unreachable", async () => {
    formDefinitions.findAll.mockRejectedValue("boom");
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      service().respond({ command: "/stats", period: "today" }, SLACK_URL, NOW),
    ).resolves.toBeUndefined();
  });

  it("survives Slack rejecting the reply", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    await expect(
      service().respond(
        { command: "/stats", period: "week", formId: "zzz" },
        SLACK_URL,
        NOW,
      ),
    ).resolves.toBeUndefined();
  });

  it("never posts to a response url that isn't Slack's", async () => {
    await service().respond(
      { command: "/stats", period: "week", formId: "zzz" },
      "https://169.254.169.254/latest/meta-data/",
      NOW,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("strips line breaks from user input before logging it", async () => {
    const error = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    formDefinitions.findAll.mockRejectedValue(new Error("boom"));
    await service().respond(
      { command: "/stats", period: "week", formId: "x\n[forged] entry" },
      SLACK_URL,
      NOW,
    );
    expect(error.mock.calls[0][0]).not.toContain("\n");
    error.mockRestore();
  });

  it("logs a non-Error delivery failure", async () => {
    fetchMock.mockRejectedValue("down");
    await expect(
      service().respond(
        { command: "/stats", period: "week", formId: "zzz" },
        SLACK_URL,
        NOW,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("SlackStatsService.postWeeklyDigest", () => {
  const WEBHOOK = "https://hooks.slack.com/services/T1/B2/abc";
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    umami.reportFunnel.mockResolvedValue(funnel(10, 8, 5));
  });
  afterEach(() => vi.unstubAllGlobals());

  const posted = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

  it("posts last week's site-wide stats to the channel webhook", async () => {
    await expect(service().postWeeklyDigest(WEBHOOK, NOW)).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(WEBHOOK);
    expect(posted().text).toMatch(/^📊 Last week:/);
    expect(posted().blocks[0].text.text).toBe("📊 Site and forms · Last week");
    expect(posted()).not.toHaveProperty("response_type");
  });

  it("posts an apology to the channel when Umami fails", async () => {
    umami.stats.mockRejectedValue(new Error("Umami 500"));
    await service().postWeeklyDigest(WEBHOOK, NOW);
    expect(posted().text).toContain("couldn't get the stats");
  });

  it.each([
    [
      "Slack rejects the post",
      () => fetchMock.mockResolvedValue({ ok: false, status: 404 }),
    ],
    [
      "Slack is unreachable",
      () => fetchMock.mockRejectedValue(new Error("ECONNRESET")),
    ],
  ])("resolves false when %s", async (_, fail) => {
    fail();
    await expect(service().postWeeklyDigest(WEBHOOK, NOW)).resolves.toBe(false);
  });
});
