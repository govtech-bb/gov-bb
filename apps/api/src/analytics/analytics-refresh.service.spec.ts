import { DataSource } from "typeorm";
import { AnalyticsRefreshService } from "./analytics-refresh.service";
import type umamiConfig from "../config/umami.config";

type UmamiCfg = ReturnType<typeof umamiConfig>;

const CONFIGURED: UmamiCfg = {
  apiKey: "api_test",
  landingWebsiteId: "w1",
  formsWebsiteId: "w1",
  apiUrl: undefined,
  timezone: "America/Barbados",
  sessionDays: 7,
  sessionMax: 500,
};

function makeService(cfg: UmamiCfg) {
  const query = vi.fn();
  const release = vi.fn().mockResolvedValue(undefined);
  const connect = vi.fn().mockResolvedValue(undefined);
  const save = vi.fn().mockResolvedValue(undefined);
  const dataSource = {
    createQueryRunner: vi.fn().mockReturnValue({ query, release, connect }),
    getRepository: vi.fn().mockReturnValue({ save }),
  } as unknown as DataSource;
  const service = new AnalyticsRefreshService(dataSource, cfg);
  return { service, query, save, release };
}

describe("AnalyticsRefreshService", () => {
  it("skips (no crawl) when Umami is not configured", async () => {
    const { service, query, save } = makeService({ ...CONFIGURED, apiKey: "" });
    const res = await service.refresh();
    expect(res.skipped).toBe(true);
    expect(query).not.toHaveBeenCalled(); // never even opens a lock
    expect(save).not.toHaveBeenCalled();
  });

  it("skips when another task holds the advisory lock", async () => {
    const { service, query, save, release } = makeService(CONFIGURED);
    query.mockResolvedValueOnce([{ pg_try_advisory_lock: false }]);
    const res = await service.refresh();
    expect(res.skipped).toBe(true);
    expect(save).not.toHaveBeenCalled(); // no crawl/upsert without the lock
    expect(release).toHaveBeenCalled(); // connection always released
  });

  it("scheduled() swallows errors (never throws out of the cron)", async () => {
    const { service } = makeService(CONFIGURED);
    // force refresh to throw by making the lock query reject
    vi.spyOn(service, "refresh").mockRejectedValueOnce(new Error("boom"));
    await expect(service.scheduled()).resolves.toBeUndefined();
  });
});
