import { Logger } from "@nestjs/common";
import type { DataSource } from "typeorm";
import type { SesMailer } from "../email/ses-mailer";
import { CheckerService } from "./checker.service";
import type { FeedService } from "./feed.service";
import type { OpsAlertService } from "./ops-alerts.service";
import type { Outage } from "./outages.domain";
import type { WaterSentAlertRepository } from "./water-sent-alert.repository";
import type { WaterSubscriberRepository } from "./water-subscriber.repository";

function outage(overrides: Partial<Outage> = {}): Outage {
  return {
    id: "n1",
    title: "Notice",
    link: "https://x",
    published: new Date().toISOString(),
    summary: "summary",
    parishes: [],
    type: "notice",
    ...overrides,
  };
}

function makeDeps(
  over: {
    dataSource?: DataSource;
    matchedRecipients?: unknown;
    pendingUnsent?: unknown;
    send?: unknown;
    configurationSet?: string;
  } = {},
) {
  const feed = {
    fetchOutages: vi
      .fn()
      .mockResolvedValue({ outages: [], checkedAt: new Date().toISOString() }),
    // The checker's view of the same cached feed: tests set fetchOutages,
    // and skipped notices through `skipped`.
    skipped: [] as Array<{ key: string; ref: string; reason: string }>,
    fetchOutagesWithSkips: vi.fn(async () => ({
      feed: await feed.fetchOutages(),
      skipped: feed.skipped,
    })),
  };
  const subscribers = {
    matchedRecipients: over.matchedRecipients ?? vi.fn().mockResolvedValue([]),
  };
  const sentAlerts = {
    claimForPairs: vi.fn().mockResolvedValue(undefined),
    pendingUnsent: over.pendingUnsent ?? vi.fn().mockResolvedValue([]),
    markManySent: vi.fn().mockResolvedValue(undefined),
  };
  const send = over.send ?? vi.fn().mockResolvedValue({});
  const mailer = {
    client: { send },
    from: "noreply@gov.bb",
    configurationSet: over.configurationSet,
    sendSimple: vi.fn(),
  };
  const opsAlerts = {
    failure: vi.fn().mockResolvedValue(undefined),
    recovered: vi.fn().mockResolvedValue(undefined),
    newSkippedNotices: vi.fn().mockResolvedValue(undefined),
  };
  const service = new CheckerService(
    over.dataSource ?? ({} as DataSource),
    feed as unknown as FeedService,
    subscribers as unknown as WaterSubscriberRepository,
    sentAlerts as unknown as WaterSentAlertRepository,
    mailer as unknown as SesMailer,
    opsAlerts as unknown as OpsAlertService,
  );
  return { service, feed, subscribers, sentAlerts, send, mailer, opsAlerts };
}

const PENDING_ROW = {
  noticeId: "n1",
  subscriberId: "s1",
  email: "a@x",
  area: "all",
  unsubscribeToken: "u1",
};

describe("CheckerService.runAlertCheck", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses outages from the cached feed snapshot", async () => {
    const { service, feed } = makeDeps();
    feed.fetchOutages.mockResolvedValue({
      outages: [outage()],
      checkedAt: new Date().toISOString(),
    });
    expect((await service.runAlertCheck()).activeNotices).toBe(1);
  });

  it("dry-run computes recipients without claiming or sending", async () => {
    const { service, sentAlerts } = makeDeps({
      matchedRecipients: vi.fn().mockResolvedValue([
        { noticeId: "n1", email: "a@x" },
        { noticeId: "n1", email: "b@x" },
      ]),
    });

    const res = await service.runAlertCheck({
      notices: [outage(), outage({ id: "unmatched" })],
      dryRun: true,
    });

    expect(res.dryRun).toBe(true);
    expect(res.recipients).toBe(2);
    expect(res.plan?.[0]?.recipients).toEqual(["a@x", "b@x"]);
    expect(res.plan?.[1]?.recipients).toEqual([]);
    expect(sentAlerts.claimForPairs).not.toHaveBeenCalled();
  });

  it("skips past notices", async () => {
    const past = outage({
      id: "old",
      endsAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    const { service } = makeDeps();
    const res = await service.runAlertCheck({ notices: [past] });
    expect(res.activeNotices).toBe(0);
  });

  it("claims a parish notice against that parish and 'all' in one call", async () => {
    const { service, sentAlerts } = makeDeps();
    await service.runAlertCheck({
      notices: [outage({ parishes: ["saint-michael"] })],
    });
    expect(sentAlerts.claimForPairs).toHaveBeenCalledWith(
      ["n1", "n1"],
      ["saint-michael", "all"],
    );
  });

  it("claims an untagged notice against 'all' only", async () => {
    const { service, sentAlerts } = makeDeps();
    await service.runAlertCheck({ notices: [outage({ parishes: [] })] });
    expect(sentAlerts.claimForPairs).toHaveBeenCalledWith(["n1"], ["all"]);
  });

  it("sends unsent claims and marks the batch sent in one call", async () => {
    const { service, sentAlerts, send } = makeDeps({
      pendingUnsent: vi.fn().mockResolvedValue([PENDING_ROW]),
    });

    const res = await service.runAlertCheck({ notices: [outage()] });

    expect(send).toHaveBeenCalledOnce();
    expect(sentAlerts.markManySent).toHaveBeenCalledWith(["n1"], ["s1"]);
    expect(res.sent).toBe(1);
    expect(res.failed).toBe(0);
  });

  it("does not mark a failed send as sent", async () => {
    const { service, sentAlerts } = makeDeps({
      pendingUnsent: vi.fn().mockResolvedValue([PENDING_ROW]),
      send: vi.fn().mockRejectedValue(new Error("SES down")),
    });

    const res = await service.runAlertCheck({ notices: [outage()] });

    expect(res.failed).toBe(1);
    expect(res.sent).toBe(0);
    // Batch marked with no successes.
    expect(sentAlerts.markManySent).toHaveBeenCalledWith([], []);
  });

  it("sends the alert with RFC 8058 one-click unsubscribe headers", async () => {
    vi.stubEnv("LANDING_BASE_URL", "https://gov.bb/");
    vi.stubEnv("API_PUBLIC_URL", "https://api.gov.bb/");
    const send = vi.fn().mockResolvedValue({});
    const { service } = makeDeps({
      pendingUnsent: vi.fn().mockResolvedValue([PENDING_ROW]),
      send,
      configurationSet: "water-alerts",
    });

    await service.runAlertCheck({ notices: [outage()] });

    const input = (send.mock.calls[0][0] as { input: any }).input;
    const headerNames = input.Content.Simple.Headers.map(
      (h: { Name: string }) => h.Name,
    );
    expect(headerNames).toContain("List-Unsubscribe");
    expect(headerNames).toContain("List-Unsubscribe-Post");
    expect(input.Content.Simple.Headers).toContainEqual({
      Name: "List-Unsubscribe",
      Value: "<https://api.gov.bb/water-alerts/unsubscribe/u1>",
    });
    expect(input.Content.Simple.Body.Text.Data).toContain(
      "https://gov.bb/health-and-emergency-services/water-outages/unsubscribe?token=u1",
    );
    expect(input.ConfigurationSetName).toBe("water-alerts");
  });

  it("omits one-click headers and links the public site when origins are unset", async () => {
    vi.stubEnv("LANDING_BASE_URL", "");
    vi.stubEnv("API_PUBLIC_URL", "");
    const send = vi.fn().mockResolvedValue({});
    const { service } = makeDeps({
      pendingUnsent: vi.fn().mockResolvedValue([PENDING_ROW]),
      send,
    });

    await service.runAlertCheck({ notices: [outage()] });

    const input = (send.mock.calls[0][0] as { input: any }).input;
    expect(input.Content.Simple.Headers).toBeUndefined();
    expect(input.Content.Simple.Body.Text.Data).toContain(
      "https://alpha.gov.bb/health-and-emergency-services/water-outages/unsubscribe?token=u1",
    );
    expect(JSON.stringify(input)).not.toContain("localhost");
  });
});

describe("CheckerService.scheduled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("skips a concurrent checker and always releases its database connection", async () => {
    const runner = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: false }]),
      release: vi.fn(),
    };
    const { service, feed, opsAlerts } = makeDeps({
      dataSource: { createQueryRunner: () => runner } as unknown as DataSource,
    });
    await service.scheduled();
    expect(feed.fetchOutages).not.toHaveBeenCalled();
    expect(opsAlerts.failure).not.toHaveBeenCalled();
    expect(opsAlerts.recovered).not.toHaveBeenCalled();
    expect(runner.query).toHaveBeenCalledOnce();
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it("releases the advisory lock after a failed feed fetch", async () => {
    const runner = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
      release: vi.fn(),
    };
    const { service, feed } = makeDeps({
      dataSource: { createQueryRunner: () => runner } as unknown as DataSource,
    });
    feed.fetchOutages.mockRejectedValue(new Error("feed down"));
    await service.scheduled();
    expect(runner.query).toHaveBeenLastCalledWith(
      "SELECT pg_advisory_unlock($1)",
      [91442],
    );
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it("reports failed sends as the send-failures signal and still releases the lock", async () => {
    const runner = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
      release: vi.fn(),
    };
    const { service, feed, sentAlerts, opsAlerts } = makeDeps({
      dataSource: {
        createQueryRunner: () => runner,
      } as unknown as DataSource,
      pendingUnsent: vi.fn().mockResolvedValue([PENDING_ROW]),
      send: vi.fn().mockRejectedValue(new Error("SES rejected alert")),
    });
    feed.fetchOutages.mockResolvedValue({
      outages: [outage()],
      checkedAt: new Date().toISOString(),
    });

    await expect(service.scheduled()).resolves.toBeUndefined();

    expect(opsAlerts.failure).toHaveBeenCalledWith(
      "send-failures",
      "1 alert send(s) failed",
      expect.stringContaining('"failed": 1'),
    );
    // The run itself completed, so the checker is not crashing.
    expect(opsAlerts.recovered).toHaveBeenCalledWith("checker-crash");
    expect(opsAlerts.recovered).not.toHaveBeenCalledWith("send-failures");
    expect(sentAlerts.markManySent).toHaveBeenCalledWith([], []);
    expect(runner.query).toHaveBeenLastCalledWith(
      "SELECT pg_advisory_unlock($1)",
      [91442],
    );
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it("reports send-failures recovered only after a run that actually sent", async () => {
    const runner = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
      release: vi.fn(),
    };
    const { service, feed, opsAlerts } = makeDeps({
      dataSource: { createQueryRunner: () => runner } as unknown as DataSource,
      pendingUnsent: vi.fn().mockResolvedValue([PENDING_ROW]),
    });
    feed.fetchOutages.mockResolvedValue({
      outages: [outage()],
      checkedAt: new Date().toISOString(),
    });

    await service.scheduled();

    expect(opsAlerts.recovered).toHaveBeenCalledWith("send-failures");
  });

  it("reports a crash as the checker-crash signal with a one-line summary first", async () => {
    const runner = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
      release: vi.fn(),
    };
    const { service, feed, opsAlerts } = makeDeps({
      dataSource: { createQueryRunner: () => runner } as unknown as DataSource,
    });
    feed.fetchOutages.mockRejectedValue(new Error("feed down"));

    await service.scheduled();

    expect(opsAlerts.failure).toHaveBeenCalledWith(
      "checker-crash",
      "feed down",
      expect.stringContaining("Error: feed down"),
    );
    expect(opsAlerts.recovered).not.toHaveBeenCalled();
  });

  it("summarises a Zod error on one line instead of raw JSON", async () => {
    const { z } = await import("zod");
    const runner = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
      release: vi.fn(),
    };
    const { service, feed, opsAlerts } = makeDeps({
      dataSource: { createQueryRunner: () => runner } as unknown as DataSource,
    });
    const zodError = z.object({ rss: z.string() }).safeParse({}).error;
    feed.fetchOutages.mockRejectedValue(zodError);

    await service.scheduled();

    const [, summary] = opsAlerts.failure.mock.calls[0];
    expect(summary).toMatch(/^rss: /);
    expect(summary).not.toContain("\n");
  });

  it("passes skipped feed notices to ops alerts and keeps them out of the run log", async () => {
    const log = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    const runner = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
      release: vi.fn(),
    };
    const { service, feed, opsAlerts } = makeDeps({
      dataSource: { createQueryRunner: () => runner } as unknown as DataSource,
    });
    feed.skipped = [
      { key: "k9", ref: '"notice-9"', reason: "pubDate: Required" },
    ];

    await service.scheduled();

    expect(opsAlerts.newSkippedNotices).toHaveBeenCalledWith(feed.skipped);
    expect(log.mock.calls[0][0]).not.toContain("notice-9");
    log.mockRestore();
  });

  it("finishes a successful scheduled check without sending an ops alert", async () => {
    const runner = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
      release: vi.fn(),
    };
    const { service, mailer, opsAlerts } = makeDeps({
      dataSource: { createQueryRunner: () => runner } as unknown as DataSource,
    });
    await service.scheduled();
    expect(mailer.sendSimple).not.toHaveBeenCalled();
    expect(opsAlerts.failure).not.toHaveBeenCalled();
    expect(opsAlerts.recovered).toHaveBeenCalledWith("checker-crash");
    // Nothing was sent, so this run says nothing about whether SES works.
    expect(opsAlerts.recovered).not.toHaveBeenCalledWith("send-failures");
    expect(runner.release).toHaveBeenCalledOnce();
  });
});
