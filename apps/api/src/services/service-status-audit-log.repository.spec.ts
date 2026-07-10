import { ServiceStatus } from "@/database/entities/service-status.entity";
import { ServiceStatusAuditLogRepository } from "./service-status-audit-log.repository";

describe("ServiceStatusAuditLogRepository", () => {
  describe("findBySlug", () => {
    it("finds audit rows for a slug ordered newest-first", async () => {
      // BaseRepository extends TypeORM's Repository; findBySlug is a thin
      // wrapper over the inherited find(). Construct without hitting a real
      // DataSource and stub find().
      const repo = Object.create(
        ServiceStatusAuditLogRepository.prototype,
      ) as ServiceStatusAuditLogRepository;
      const rows = [
        {
          slug: "passport-renewal",
          oldState: ServiceStatus.ENABLED,
          newState: ServiceStatus.DISABLED,
          author: "admin@govtech.bb",
        },
      ];
      const find = vi.fn().mockResolvedValue(rows);
      (repo as unknown as { find: typeof find }).find = find;

      const result = await repo.findBySlug("passport-renewal");

      expect(find).toHaveBeenCalledWith({
        where: { slug: "passport-renewal" },
        order: { changedAt: "DESC" },
      });
      expect(result).toBe(rows);
    });
  });
});
