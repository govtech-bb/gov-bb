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
    matchedRecipients?: unknown;
    pendingUnsent?: unknown;
    send?: unknown;
  } = {},
) {
  const feed = { fetchOutages: vi.fn().mockResolvedValue([]) };
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
    configurationSet: undefined,
    sendSimple: vi.fn(),
  };
  const service = new CheckerService(
    {} as DataSource,
    feed as unknown as FeedService,
    subscribers as unknown as WaterSubscriberRepository,
    sentAlerts as unknown as WaterSentAlertRepository,
    mailer as unknown as SesMailer,
  );
  return { service, feed, subscribers, sentAlerts, send };
}

const PENDING_ROW = {
  noticeId: "n1",
  subscriberId: "s1",
  email: "a@x",
  area: "all",
  unsubscribeToken: "u1",
};

describe("CheckerService.runAlertCheck", () => {
  it("dry-run computes recipients without claiming or sending", async () => {
    const { service, sentAlerts } = makeDeps({
      matchedRecipients: vi.fn().mockResolvedValue([
        { noticeId: "n1", email: "a@x" },
        { noticeId: "n1", email: "b@x" },
      ]),
    });

    const res = await service.runAlertCheck({
      notices: [outage()],
      dryRun: true,
    });

    expect(res.dryRun).toBe(true);
    expect(res.recipients).toBe(2);
    expect(res.plan?.[0]?.recipients).toEqual(["a@x", "b@x"]);
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

  it("demo run uses the [DEMO] template with one-click unsubscribe header", async () => {
    const send = vi.fn().mockResolvedValue({});
    const { service } = makeDeps({
      pendingUnsent: vi.fn().mockResolvedValue([PENDING_ROW]),
      send,
    });

    await service.runAlertCheck({ notices: [outage()], demo: true });

    const input = (send.mock.calls[0][0] as { input: any }).input;
    expect(input.Content.Simple.Subject.Data).toMatch(/^\[DEMO\]/);
    const headerNames = input.Content.Simple.Headers.map(
      (h: { Name: string }) => h.Name,
    );
    expect(headerNames).toContain("List-Unsubscribe");
    expect(headerNames).toContain("List-Unsubscribe-Post");
  });
});
