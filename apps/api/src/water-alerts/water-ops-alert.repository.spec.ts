import type { DataSource } from "typeorm";
import { WaterOpsAlertRepository } from "./water-ops-alert.repository";

function repositoryWith(query: ReturnType<typeof vi.fn>) {
  return new WaterOpsAlertRepository({
    createEntityManager: () => ({ query }),
  } as unknown as DataSource);
}

describe("WaterOpsAlertRepository.recordFailure", () => {
  it("claims the alert in one upsert that only wins when new or due a reminder", async () => {
    const query = vi.fn().mockResolvedValue([]);
    await repositoryWith(query).recordFailure("checker-crash", "6 hours");

    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(["checker-crash", "6 hours"]);
    expect(sql).toContain('ON CONFLICT ("key") DO UPDATE');
    expect(sql).toContain('"failing_since" IS NULL');
    expect(sql).toContain("< NOW() - $2::interval");
    expect(sql).toContain("RETURNING");
  });

  it("reports a first alert when the failure starts now", async () => {
    const since = new Date("2026-10-09T10:00:00Z");
    const query = vi
      .fn()
      .mockResolvedValue([{ failingSince: since, first: true }]);
    await expect(
      repositoryWith(query).recordFailure("checker-crash", "6 hours"),
    ).resolves.toEqual({ kind: "first", failingSince: since });
  });

  it("reports a reminder when the failure started earlier", async () => {
    const since = new Date("2026-10-09T04:00:00Z");
    const query = vi
      .fn()
      .mockResolvedValue([{ failingSince: since, first: false }]);
    await expect(
      repositoryWith(query).recordFailure("checker-crash", "6 hours"),
    ).resolves.toEqual({ kind: "reminder", failingSince: since });
  });

  it("returns null when another run already alerted recently", async () => {
    const query = vi.fn().mockResolvedValue([]);
    await expect(
      repositoryWith(query).recordFailure("checker-crash", "6 hours"),
    ).resolves.toBeNull();
  });
});

describe("WaterOpsAlertRepository.recordRecovery", () => {
  it("clears a failing signal and returns when it started", async () => {
    const since = new Date("2026-10-09T04:00:00Z");
    // TypeORM's Postgres driver returns [rows, rowCount] for UPDATE.
    const query = vi.fn().mockResolvedValue([[{ failingSince: since }], 1]);
    await expect(
      repositoryWith(query).recordRecovery("checker-crash"),
    ).resolves.toEqual(since);

    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(["checker-crash"]);
    expect(sql).toContain('SET "failing_since" = NULL');
    expect(sql).toContain('"failing_since" IS NOT NULL');
    expect(sql).toContain("FOR UPDATE");
  });

  it("returns null when the signal was not failing", async () => {
    const query = vi.fn().mockResolvedValue([[], 0]);
    await expect(
      repositoryWith(query).recordRecovery("checker-crash"),
    ).resolves.toBeNull();
  });
});

describe("WaterOpsAlertRepository.claimNew", () => {
  it("inserts every key at once and returns only those not seen before", async () => {
    const query = vi.fn().mockResolvedValue([{ key: "skipped-notice:a" }]);
    await expect(
      repositoryWith(query).claimNew(["skipped-notice:a", "skipped-notice:b"]),
    ).resolves.toEqual(["skipped-notice:a"]);

    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual([["skipped-notice:a", "skipped-notice:b"]]);
    expect(sql).toContain("unnest($1::text[])");
    expect(sql).toContain('ON CONFLICT ("key") DO NOTHING');
  });

  it("makes no query for an empty list", async () => {
    const query = vi.fn();
    await expect(repositoryWith(query).claimNew([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
