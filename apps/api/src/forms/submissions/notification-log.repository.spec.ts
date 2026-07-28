import type { Mock } from "vitest";
import { DataSource, EntityManager } from "typeorm";
import { NotificationLogRepository } from "./notification-log.repository";
import {
  NotificationLogEntity,
  NotificationDeliveryStatus,
} from "@/database/entities/notification-log.entity";

function makeRepo(): NotificationLogRepository {
  const fakeManager = { transaction: vi.fn() } as unknown as EntityManager;
  const dataSource = {
    createEntityManager: vi.fn().mockReturnValue(fakeManager),
  } as unknown as DataSource;
  return new NotificationLogRepository(dataSource);
}

/** Chainable query-builder stub whose execute() is observable. */
function makeQb() {
  const execute = vi.fn().mockResolvedValue({ affected: 1 });
  const qb: Record<string, Mock> = {};
  for (const m of ["update", "set", "where", "andWhere"]) {
    qb[m] = vi.fn().mockReturnValue(qb);
  }
  qb.execute = execute;
  return { qb, execute };
}

describe("NotificationLogRepository.reconcileDeliveryStatus", () => {
  it("returns 'unmatched' and does not update when no row has the message id", async () => {
    const repo = makeRepo();
    (repo as any).count = vi.fn().mockResolvedValue(0);
    const qbSpy = vi.fn();
    (repo as any).createQueryBuilder = qbSpy;

    const result = await repo.reconcileDeliveryStatus(
      "missing-id",
      NotificationDeliveryStatus.BOUNCED,
    );

    expect(result).toBe("unmatched");
    expect(qbSpy).not.toHaveBeenCalled();
  });

  it("returns 'matched' and runs a guarded UPDATE when a row exists", async () => {
    const repo = makeRepo();
    (repo as any).count = vi.fn().mockResolvedValue(1);
    const { qb, execute } = makeQb();
    (repo as any).createQueryBuilder = vi.fn().mockReturnValue(qb);

    const result = await repo.reconcileDeliveryStatus(
      "ses-1",
      NotificationDeliveryStatus.DELIVERED,
    );

    expect(result).toBe("matched");
    expect(qb.update).toHaveBeenCalledWith(NotificationLogEntity);
    expect(qb.set).toHaveBeenCalledWith({
      deliveryStatus: NotificationDeliveryStatus.DELIVERED,
    });
    // The guard clause carries the "don't downgrade to delivered" condition.
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("delivery_status IS NULL"),
      expect.objectContaining({
        status: NotificationDeliveryStatus.DELIVERED,
        delivered: NotificationDeliveryStatus.DELIVERED,
      }),
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
