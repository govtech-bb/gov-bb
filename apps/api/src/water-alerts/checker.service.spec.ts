import type { DataSource } from "typeorm";
import type { SesMailer } from "../email/ses-mailer";
import { CheckerService } from "./checker.service";
import type { FeedService } from "./feed.service";
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
  const service = new CheckerService(
    over.dataSource ?? ({} as DataSource),
    feed as unknown as FeedService,
    subscribers as unknown as WaterSubscriberRepository,
    sentAlerts as unknown as WaterSentAlertRepository,
    mailer as unknown as SesMailer,
  );
  return { service, feed, subscribers, sentAlerts, send, mailer };
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
});

describe("CheckerService.scheduled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("skips a concurrent checker and always releases its database connection", async () => {
    const runner = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: false }]),
      release: vi.fn(),
    };
    const { service, feed } = makeDeps({
      dataSource: { createQueryRunner: () => runner } as unknown as DataSource,
    });
    await service.scheduled();
    expect(feed.fetchOutages).not.toHaveBeenCalled();
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

  it.each([false, true])(
    "reports failed sends and releases the lock even if ops delivery fails (%s)",
    async (opsFails) => {
      vi.stubEnv("WATER_OPS_RECIPIENT", "ops@example.test");
      const runner = {
        connect: vi.fn(),
        query: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
        release: vi.fn(),
      };
      const { service, feed, mailer, sentAlerts } = makeDeps({
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
      if (opsFails)
        mailer.sendSimple.mockRejectedValue(new Error("ops unavailable"));

      await expect(service.scheduled()).resolves.toBeUndefined();

      expect(mailer.sendSimple).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "ops@example.test",
          subject: "Wuh Water Doing: 1 alert send(s) failed",
          text: expect.stringContaining('"failed": 1'),
        }),
      );
      expect(sentAlerts.markManySent).toHaveBeenCalledWith([], []);
      expect(runner.query).toHaveBeenLastCalledWith(
        "SELECT pg_advisory_unlock($1)",
        [91442],
      );
      expect(runner.release).toHaveBeenCalledOnce();
    },
  );

  it("finishes a successful scheduled check without sending an ops alert", async () => {
    const runner = {
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
      release: vi.fn(),
    };
    const { service, mailer } = makeDeps({
      dataSource: { createQueryRunner: () => runner } as unknown as DataSource,
    });
    await service.scheduled();
    expect(mailer.sendSimple).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledOnce();
  });
});
