import type { Mocked } from "vitest";
import {
  ServiceStatusEntity,
  ServiceStatus,
} from "@/database/entities/service-status.entity";
import { ServiceStatusRepository } from "./service-status.repository";
import { ServiceStatusAuditLogRepository } from "./service-status-audit-log.repository";
import { ServiceStatusService } from "./service-status.service";

function makeAuditRepo(): Mocked<ServiceStatusAuditLogRepository> {
  return {
    create: vi.fn((row) => row),
    save: vi.fn(),
  } as unknown as Mocked<ServiceStatusAuditLogRepository>;
}

function makeStatusRepo(
  auditRepo: Mocked<ServiceStatusAuditLogRepository>,
): Mocked<ServiceStatusRepository> {
  const repo = {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn((row) => row),
    save: vi.fn(),
    withRepo: vi.fn(() => auditRepo),
    // tx runs its callback synchronously against the same repo instance,
    // mirroring the real SERIALIZABLE-transaction wrapper.
    tx: vi.fn((cb) => cb(repo)),
  };
  return repo as unknown as Mocked<ServiceStatusRepository>;
}

function makeRow(
  overrides: Partial<ServiceStatusEntity> = {},
): ServiceStatusEntity {
  return {
    id: "uuid-1",
    slug: "passport-renewal",
    status: ServiceStatus.ENABLED,
    ...overrides,
  } as ServiceStatusEntity;
}

describe("ServiceStatusService", () => {
  describe("list", () => {
    it("maps every row to { slug, status }", async () => {
      const auditRepo = makeAuditRepo();
      const statusRepo = makeStatusRepo(auditRepo);
      statusRepo.find.mockResolvedValue([
        makeRow({ slug: "a", status: ServiceStatus.ENABLED }),
        makeRow({ slug: "b", status: ServiceStatus.DISABLED }),
      ]);
      const service = new ServiceStatusService(statusRepo, auditRepo);

      const result = await service.list();

      expect(result).toEqual([
        { slug: "a", status: ServiceStatus.ENABLED },
        { slug: "b", status: ServiceStatus.DISABLED },
      ]);
    });
  });

  describe("setStatus", () => {
    it("creates the row and audits oldState=null for a service's first entry", async () => {
      const auditRepo = makeAuditRepo();
      const statusRepo = makeStatusRepo(auditRepo);
      statusRepo.findOne.mockResolvedValue(null);
      const service = new ServiceStatusService(statusRepo, auditRepo);

      const result = await service.setStatus(
        "passport-renewal",
        ServiceStatus.DISABLED,
        "admin@govtech.bb",
      );

      expect(statusRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "passport-renewal",
          status: ServiceStatus.DISABLED,
        }),
      );
      expect(auditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "passport-renewal",
          oldState: null,
          newState: ServiceStatus.DISABLED,
          author: "admin@govtech.bb",
        }),
      );
      expect(result).toEqual({
        slug: "passport-renewal",
        status: ServiceStatus.DISABLED,
      });
    });

    it("updates the existing row and audits old→new on a change", async () => {
      const auditRepo = makeAuditRepo();
      const statusRepo = makeStatusRepo(auditRepo);
      const existing = makeRow({ status: ServiceStatus.ENABLED });
      statusRepo.findOne.mockResolvedValue(existing);
      const service = new ServiceStatusService(statusRepo, auditRepo);

      await service.setStatus(
        "passport-renewal",
        ServiceStatus.FORM_DISABLED,
        "admin@govtech.bb",
      );

      expect(statusRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ServiceStatus.FORM_DISABLED }),
      );
      expect(auditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          oldState: ServiceStatus.ENABLED,
          newState: ServiceStatus.FORM_DISABLED,
          author: "admin@govtech.bb",
        }),
      );
    });

    it("is an idempotent no-op when the status is unchanged", async () => {
      const auditRepo = makeAuditRepo();
      const statusRepo = makeStatusRepo(auditRepo);
      statusRepo.findOne.mockResolvedValue(
        makeRow({ status: ServiceStatus.ENABLED }),
      );
      const service = new ServiceStatusService(statusRepo, auditRepo);

      const result = await service.setStatus(
        "passport-renewal",
        ServiceStatus.ENABLED,
        "admin@govtech.bb",
      );

      expect(statusRepo.save).not.toHaveBeenCalled();
      expect(auditRepo.save).not.toHaveBeenCalled();
      expect(result).toEqual({
        slug: "passport-renewal",
        status: ServiceStatus.ENABLED,
      });
    });
  });
});
