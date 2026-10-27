import type { DataSource } from "typeorm";
import { WaterOpsAlertRepository } from "./water-ops-alert.repository";

function repositoryWith(query: ReturnType<typeof vi.fn>) {
  return new WaterOpsAlertRepository({
    createEntityManager: () => ({ query }),
  } as unknown as DataSource);
}

describe("WaterOpsAlertRepository.recordFailure", () => {
  /** The ensure-row INSERT, then the UPDATE's [rows, rowCount]. */
  const queryReturning = (rows: unknown[]) =>
    vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([rows, rows.length]);

  it("decides from the row as it was, locked, and only alerts past the interval", async () => {
    const query = queryReturning([]);
    await repositoryWith(query).recordFailure("checker-crash", "6 hours");

    const [insertSql, insertParams] = query.mock.calls[0];
    expect(insertSql).toContain('ON CONFLICT ("key") DO NOTHING');
    expect(insertParams).toEqual(["checker-crash"]);

    const [sql, params] = query.mock.calls[1];
    expect(params).toEqual(["checker-crash", "6 hours"]);
    expect(sql).toContain("FOR UPDATE");
    // failing_since is always kept/set; last_alerted_at only moves when alerting,
    // so a failure that flaps back within the interval stays quiet (#2970).
    expect(sql).toContain('COALESCE(prev."failing_since", NOW())');
    expect(sql).toContain("< NOW() - $2::interval THEN NOW()");
    // "first" = no alert since this failure started (Shannon's review on #2982),
    // not "this failure started now".
    expect(sql).toContain(
      'prev."last_alerted_at" < a."failing_since") AS "first"',
    );
    expect(sql).toContain(
      'prev."last_alerted_at"::text AS "previousAlertedAt"',
    );
  });

  it("reports a first alert with the alert time it replaced", async () => {
    const since = new Date("2026-10-09T10:00:00Z");
    const query = queryReturning([
      {
        failingSince: since,
        alerted: true,
        first: true,
        previousAlertedAt: null,
      },
    ]);
    await expect(
      repositoryWith(query).recordFailure("checker-crash", "6 hours"),
    ).resolves.toEqual({
      kind: "first",
      failingSince: since,
      previousAlertedAt: null,
    });
  });

  it("reports a reminder when an alert already went out for this failure", async () => {
    const since = new Date("2026-10-09T04:00:00Z");
    const query = queryReturning([
      {
        failingSince: since,
        alerted: true,
        first: false,
        previousAlertedAt: "2026-10-09 04:00:00.123456",
      },
    ]);
    await expect(
      repositoryWith(query).recordFailure("checker-crash", "6 hours"),
    ).resolves.toEqual({
      kind: "reminder",
      failingSince: since,
      previousAlertedAt: "2026-10-09 04:00:00.123456",
    });
  });

  it("returns null when the failure was recorded but alerted recently", async () => {
    const query = queryReturning([
      {
        failingSince: new Date(),
        alerted: false,
        first: true,
        previousAlertedAt: null,
      },
    ]);
    await expect(
      repositoryWith(query).recordFailure("checker-crash", "6 hours"),
    ).resolves.toBeNull();
  });
});

describe("WaterOpsAlertRepository.recordRecovery", () => {
  it("clears a failing signal and returns when it started", async () => {
    const since = new Date("2026-10-09T04:00:00Z");
    // TypeORM's Postgres driver returns [rows, rowCount] for UPDATE.
    const query = vi
      .fn()
      .mockResolvedValue([[{ failingSince: since, alerted: true }], 1]);
    await expect(
      repositoryWith(query).recordRecovery("checker-crash"),
    ).resolves.toEqual(since);

    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(["checker-crash"]);
    expect(sql).toContain('SET "failing_since" = NULL');
    expect(sql).toContain('"failing_since" IS NOT NULL');
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain('"last_alerted_at" >= prev."failing_since"');
  });

  it("recovers silently when that failure was never alerted (it flapped)", async () => {
    const query = vi
      .fn()
      .mockResolvedValue([[{ failingSince: new Date(), alerted: false }], 1]);
    await expect(
      repositoryWith(query).recordRecovery("checker-crash"),
    ).resolves.toBeNull();
  });

  it("returns null when the signal was not failing", async () => {
    const query = vi.fn().mockResolvedValue([[], 0]);
    await expect(
      repositoryWith(query).recordRecovery("checker-crash"),
    ).resolves.toBeNull();
  });
});

describe("WaterOpsAlertRepository.releaseClaims", () => {
  it("forgets claims whose email failed, so the next run reports them again", async () => {
    const query = vi.fn().mockResolvedValue([[], 1]);
    await repositoryWith(query).releaseClaims(["skipped-notice:abc"]);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('DELETE FROM "water_ops_alerts"');
    expect(sql).toContain('"key" = ANY($1::text[])');
    expect(params).toEqual([["skipped-notice:abc"]]);
  });

  it("makes no query for an empty list", async () => {
    const query = vi.fn();
    await repositoryWith(query).releaseClaims([]);
    expect(query).not.toHaveBeenCalled();
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

describe("WaterOpsAlertRepository.markHealthy", () => {
  it("marks a signal healthy without reporting a recovery", async () => {
    const query = vi.fn().mockResolvedValue([[], 1]);
    await repositoryWith(query).markHealthy("send-failures");

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('SET "failing_since" = NULL');
    expect(sql).not.toContain("RETURNING");
    expect(params).toEqual(["send-failures"]);
  });
});

describe("WaterOpsAlertRepository.forgetAlert", () => {
  it("puts back the alert time from before the undelivered alert", async () => {
    const query = vi.fn().mockResolvedValue([[], 1]);
    await repositoryWith(query).forgetAlert(
      "checker-crash",
      "2026-10-09 04:00:00.123456",
    );

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('SET "last_alerted_at" = $2::timestamp');
    expect(params).toEqual(["checker-crash", "2026-10-09 04:00:00.123456"]);
  });
});
