import type { ConfigService } from "@nestjs/config";
import type { FormDefinitionsService } from "@/forms/form-definitions/form-definitions.service";
import { Logger } from "@nestjs/common";
import { SlackStatsService, slackResponseUrl } from "./slack-stats.service";

// A fake Umami client: funnel rows and event values keyed by event name, the
// same for every period unless a test overrides `funnels` per call.
const umami = vi.hoisted(() => ({
  stats: vi.fn(),
  reportFunnel: vi.fn(),
  eventDataValues: vi.fn(),
}));
vi.mock("@govtech-bb/umami-analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@govtech-bb/umami-analytics")>()),
  UmamiClient: vi.fn(function () {
    return umami;
  }),
}));

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
  });
});

describe("SlackStatsService.buildReply — one form", () => {
  it("suggests similar ids for an unknown form", async () => {
    const text = await reply("/stats", "week", "passport", NOW);
    expect(text).toBe(
      "🤔 No form with the ID `passport`. Did you mean `passport-renewal`?",
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
  it("keeps a Slack hooks URL", () => {
    expect(
      slackResponseUrl("https://hooks.slack.com/commands/T1/1/abc?x=1"),
    ).toBe("https://hooks.slack.com/commands/T1/1/abc?x=1");
  });

  it.each([
    "",
    "not a url",
    "http://hooks.slack.com/commands/1",
    "https://hooks.slack.com.evil.example/commands/1",
    "https://evil.example/hooks.slack.com/",
    "https://hooks.slack.com:8443/commands/1",
    "https://user:pass@hooks.slack.com/commands/1",
    "https://169.254.169.254/latest/meta-data/",
  ])("refuses %j", (raw) => {
    expect(slackResponseUrl(raw)).toBeNull();
  });
});

describe("slackResponseUrl", () => {
  it("keeps a Slack hooks URL", () => {
    expect(
      slackResponseUrl("https://hooks.slack.com/commands/T1/1/abc?x=1"),
    ).toBe("https://hooks.slack.com/commands/T1/1/abc?x=1");
  });

  it.each([
    "",
    "not a url",
    "http://hooks.slack.com/commands/1",
    "https://hooks.slack.com.evil.example/commands/1",
    "https://evil.example/hooks.slack.com/",
    "https://hooks.slack.com:8443/commands/1",
    "https://user:pass@hooks.slack.com/commands/1",
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
      "https://hooks.slack.com/commands/1",
      NOW,
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://hooks.slack.com/commands/1",
    );
    expect(posted()).toMatchObject({ response_type: "ephemeral" });
    expect(posted().text).toContain("No form with the ID `zzz`");
  });

  it("posts an apology when Umami fails", async () => {
    umami.stats.mockRejectedValue(new Error("Umami 500"));
    umami.reportFunnel.mockResolvedValue([]);
    await service().respond(
      { command: "/stats", period: "week" },
      "https://hooks.slack.com/commands/1",
      NOW,
    );
    expect(posted().text).toContain("couldn't get the stats");
  });

  it("logs a non-string failure and never throws when Slack is unreachable", async () => {
    formDefinitions.findAll.mockRejectedValue("boom");
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      service().respond(
        { command: "/stats", period: "today" },
        "https://hooks.slack.com/commands/1",
        NOW,
      ),
    ).resolves.toBeUndefined();
  });

  it("survives Slack rejecting the reply", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    await expect(
      service().respond(
        { command: "/stats", period: "week", formId: "zzz" },
        "https://hooks.slack.com/commands/1",
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
      "https://hooks.slack.com/commands/1",
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
        "https://hooks.slack.com/commands/1",
        NOW,
      ),
    ).resolves.toBeUndefined();
  });
});
