import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { CheckerService } from "./checker.service";
import type { FeedService } from "./feed.service";
import type { Outage } from "./outages.domain";
import type { SubscriptionService } from "./subscription.service";
import { WaterAlertsController } from "./water-alerts.controller";

const OUTAGE: Outage = {
  id: "notice-1",
  title: "Repair",
  link: "https://x",
  published: "2026-06-22T08:00:00.000Z",
  summary: "s",
  parishes: ["saint-michael"],
  type: "repair",
};

function make(
  feed: Partial<FeedService>,
  subs: Partial<SubscriptionService> = {},
  checker: Partial<CheckerService> = {},
): WaterAlertsController {
  return new WaterAlertsController(
    feed as FeedService,
    subs as SubscriptionService,
    checker as CheckerService,
  );
}

describe("WaterAlertsController", () => {
  it("returns the outages and a checkedAt timestamp", async () => {
    const controller = make({
      fetchOutages: vi.fn().mockResolvedValue([OUTAGE]),
    });
    const res = await controller.outages();
    expect(res.outages).toEqual([OUTAGE]);
    expect(Number.isNaN(Date.parse(res.checkedAt))).toBe(false);
  });

  it("maps a feed failure to a 503", async () => {
    const controller = make({
      fetchOutages: vi.fn().mockRejectedValue(new Error("feed down")),
    });
    await expect(controller.outages()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("delegates subscribe to the service", async () => {
    const subscribe = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "check email", emailSent: true });
    const controller = make({}, { subscribe });
    const res = await controller.subscribe({ email: "a@b.com", area: "all" });
    expect(subscribe).toHaveBeenCalledWith("a@b.com", "all");
    expect(res.ok).toBe(true);
  });

  it("returns the confirm/unsubscribe outcome", async () => {
    const controller = make(
      {},
      {
        confirm: vi.fn().mockResolvedValue("done"),
        unsubscribe: vi.fn().mockResolvedValue("already"),
      },
    );
    expect(await controller.confirm("t1")).toEqual({ result: "done" });
    expect(await controller.unsubscribe("t2")).toEqual({ result: "already" });
  });

  it("one-click unsubscribe calls the service and returns void", async () => {
    const unsubscribe = vi.fn().mockResolvedValue("done");
    const controller = make({}, { unsubscribe });
    await expect(controller.unsubscribeOneClick("t3")).resolves.toBeUndefined();
    expect(unsubscribe).toHaveBeenCalledWith("t3");
  });

  describe("demo (preview-gated)", () => {
    const prev = process.env.WATER_DEMO_TOKEN;
    afterEach(() => {
      if (prev === undefined) delete process.env.WATER_DEMO_TOKEN;
      else process.env.WATER_DEMO_TOKEN = prev;
    });

    it("404s when the demo token is not configured", () => {
      delete process.env.WATER_DEMO_TOKEN;
      const controller = make({}, {}, { runDemo: vi.fn() });
      expect(() => controller.demo("anything")).toThrow(NotFoundException);
    });

    it("403s when the header does not match", () => {
      process.env.WATER_DEMO_TOKEN = "secret";
      const controller = make({}, {}, { runDemo: vi.fn() });
      expect(() => controller.demo("wrong")).toThrow(ForbiddenException);
    });

    it("runs the demo when the header matches", async () => {
      process.env.WATER_DEMO_TOKEN = "secret";
      const runDemo = vi.fn().mockResolvedValue({ sent: 1 });
      const controller = make({}, {}, { runDemo });
      await controller.demo("secret");
      expect(runDemo).toHaveBeenCalled();
    });
  });
});
