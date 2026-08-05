import { ServiceUnavailableException } from "@nestjs/common";
import type { FeedService } from "./feed.service";
import type { Outage } from "./outages.domain";
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

function makeFeed(impl: Partial<FeedService>): FeedService {
  return impl as FeedService;
}

describe("WaterAlertsController", () => {
  it("returns the outages and a checkedAt timestamp", async () => {
    const controller = new WaterAlertsController(
      makeFeed({ fetchOutages: vi.fn().mockResolvedValue([OUTAGE]) }),
    );

    const res = await controller.outages();

    expect(res.outages).toEqual([OUTAGE]);
    expect(() => new Date(res.checkedAt).toISOString()).not.toThrow();
    expect(Number.isNaN(Date.parse(res.checkedAt))).toBe(false);
  });

  it("maps a feed failure to a 503", async () => {
    const controller = new WaterAlertsController(
      makeFeed({
        fetchOutages: vi.fn().mockRejectedValue(new Error("feed down")),
      }),
    );

    await expect(controller.outages()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
