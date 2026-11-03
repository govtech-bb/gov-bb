import type { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import type { DataSource } from "typeorm";
import type { SlackStatsService } from "./slack-stats.service";
import { WeeklyDigestService } from "./weekly-digest.service";

const WEBHOOK = "https://hooks.slack.com/services/T1/B2/abc";

function setup({
  webhook = WEBHOOK,
  configured = true,
  locked = true,
}: { webhook?: string; configured?: boolean; locked?: boolean } = {}) {
  const runner = {
    connect: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(async (sql: string) =>
      sql.includes("pg_try_advisory_lock")
        ? [{ pg_try_advisory_lock: locked }]
        : [],
    ),
  };
  const stats = {
    isConfigured: vi.fn().mockReturnValue(configured),
    postWeeklyDigest: vi.fn().mockResolvedValue(undefined),
  };
  const service = new WeeklyDigestService(
    { createQueryRunner: () => runner } as unknown as DataSource,
    {
      get: (k: string) =>
        k === "SLACK_STATS_WEBHOOK_URL" ? webhook : undefined,
    } as unknown as ConfigService,
    stats as unknown as SlackStatsService,
  );
  return { service, runner, stats };
}

describe("WeeklyDigestService.scheduled", () => {
  it("posts the digest under the advisory lock, then releases it", async () => {
    const { service, runner, stats } = setup();
    await service.scheduled();
    expect(stats.postWeeklyDigest).toHaveBeenCalledWith(WEBHOOK);
    expect(runner.query).toHaveBeenCalledWith(
      "SELECT pg_advisory_unlock($1)",
      expect.any(Array),
    );
    expect(runner.release).toHaveBeenCalled();
  });

  it("skips when another task holds the lock", async () => {
    const { service, runner, stats } = setup({ locked: false });
    await service.scheduled();
    expect(stats.postWeeklyDigest).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
  });

  it.each([
    ["no webhook is set", { webhook: "" }],
    ["Umami isn't configured", { configured: false }],
  ])("does nothing when %s", async (_, opts) => {
    const { service, runner, stats } = setup(opts);
    await service.scheduled();
    expect(runner.connect).not.toHaveBeenCalled();
    expect(stats.postWeeklyDigest).not.toHaveBeenCalled();
  });

  it("logs a database failure and still releases the runner", async () => {
    const error = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    const { service, runner, stats } = setup();
    runner.connect.mockRejectedValue(new Error("db down"));
    await expect(service.scheduled()).resolves.toBeUndefined();
    expect(stats.postWeeklyDigest).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
    error.mockRestore();
  });
});
