import { DataSource } from "typeorm";
import { AnalyticsController } from "./analytics.controller";

function makeController(row: unknown) {
  const findOne = vi.fn().mockResolvedValue(row);
  const dataSource = {
    getRepository: vi.fn().mockReturnValue({ findOne }),
  } as unknown as DataSource;
  return new AnalyticsController(dataSource);
}

describe("AnalyticsController", () => {
  it("reports not-ready when the cache is empty (cold start)", async () => {
    const res = await makeController(null).report();
    expect(res).toEqual({ ready: false, refreshedAt: null, report: null });
  });

  it("serves the cached report + freshness when present", async () => {
    const refreshedAt = new Date("2026-07-10T09:00:00.000Z");
    const report = { presets: [], sessions: { totals: { sessions: 5 } } };
    const res = await makeController({
      key: "latest",
      data: report,
      refreshedAt,
    }).report();
    expect(res.ready).toBe(true);
    expect(res.refreshedAt).toBe("2026-07-10T09:00:00.000Z");
    expect(res.report).toEqual(report);
  });
});
