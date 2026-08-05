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
    fetchOutages?: unknown;
    findConfirmedForAreas?: unknown;
    pendingUnsent?: unknown;
    send?: unknown;
  } = {},
) {
  const feed = {
    fetchOutages: vi.fn().mockResolvedValue([]),
    ...(over.fetchOutages ? { fetchOutages: over.fetchOutages } : {}),
  };
  const subscribers = {
    findConfirmedForAreas:
      over.findConfirmedForAreas ?? vi.fn().mockResolvedValue([]),
  };
  const sentAlerts = {
    claim: vi.fn().mockResolvedValue(undefined),
    pendingUnsent: over.pendingUnsent ?? vi.fn().mockResolvedValue([]),
    markSent: vi.fn().mockResolvedValue(undefined),
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

describe("CheckerService.runAlertCheck", () => {
  it("dry-run computes recipients without claiming or sending", async () => {
    const { service, subscribers, sentAlerts } = makeDeps({
      findConfirmedForAreas: vi.fn().mockResolvedValue([
        { id: "s1", email: "a@x" },
        { id: "s2", email: "b@x" },
      ]),
    });

    const res = await service.runAlertCheck({
      notices: [outage()],
      dryRun: true,
    });

    expect(res.dryRun).toBe(true);
    expect(res.recipients).toBe(2);
    expect(res.plan?.[0]?.recipients).toEqual(["a@x", "b@x"]);
    expect(sentAlerts.claim).not.toHaveBeenCalled();
    expect(subscribers.findConfirmedForAreas).toHaveBeenCalledOnce();
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

  it("matches a parish notice to that parish and 'all'", async () => {
    const find = vi.fn().mockResolvedValue([]);
    const { service } = makeDeps({ findConfirmedForAreas: find });
    await service.runAlertCheck({
      notices: [outage({ parishes: ["saint-michael"] })],
    });
    expect(find).toHaveBeenCalledWith(["saint-michael", "all"]);
  });

  it("matches an untagged notice to 'all' only", async () => {
    const find = vi.fn().mockResolvedValue([]);
    const { service } = makeDeps({ findConfirmedForAreas: find });
    await service.runAlertCheck({ notices: [outage({ parishes: [] })] });
    expect(find).toHaveBeenCalledWith(["all"]);
  });

  it("claims each pair then sends unsent claims and marks them", async () => {
    const { service, sentAlerts, send } = makeDeps({
      findConfirmedForAreas: vi
        .fn()
        .mockResolvedValue([{ id: "s1" }, { id: "s2" }]),
      pendingUnsent: vi.fn().mockResolvedValue([
        {
          noticeId: "n1",
          subscriberId: "s1",
          email: "a@x",
          area: "all",
          unsubscribeToken: "u1",
        },
      ]),
    });

    const res = await service.runAlertCheck({ notices: [outage()] });

    expect(sentAlerts.claim).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledOnce();
    expect(sentAlerts.markSent).toHaveBeenCalledWith("n1", "s1");
    expect(res.sent).toBe(1);
    expect(res.failed).toBe(0);
  });

  it("counts a failed send and does not mark it sent", async () => {
    const { service, sentAlerts } = makeDeps({
      pendingUnsent: vi.fn().mockResolvedValue([
        {
          noticeId: "n1",
          subscriberId: "s1",
          email: "a@x",
          area: "all",
          unsubscribeToken: "u1",
        },
      ]),
      send: vi.fn().mockRejectedValue(new Error("SES down")),
    });

    const res = await service.runAlertCheck({ notices: [outage()] });

    expect(res.failed).toBe(1);
    expect(res.sent).toBe(0);
    expect(sentAlerts.markSent).not.toHaveBeenCalled();
  });

  it("demo run uses the [DEMO] template with one-click unsubscribe header", async () => {
    const send = vi.fn().mockResolvedValue({});
    const { service } = makeDeps({
      pendingUnsent: vi.fn().mockResolvedValue([
        {
          noticeId: "n1",
          subscriberId: "s1",
          email: "a@x",
          area: "all",
          unsubscribeToken: "u1",
        },
      ]),
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
