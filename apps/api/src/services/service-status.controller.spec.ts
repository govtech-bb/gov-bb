import { ServiceStatus } from "@/database/entities/service-status.entity";
import { ServiceStatusController } from "./service-status.controller";
import type { UpdateServiceStatusDto } from "./dto";

const mockService = {
  list: vi.fn(),
  setStatus: vi.fn(),
  getAuditForSlug: vi.fn(),
};

describe("ServiceStatusController", () => {
  let controller: ServiceStatusController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new ServiceStatusController(mockService as never);
  });

  describe("list (GET /service_status)", () => {
    it("calls service.list and returns the success response shape", async () => {
      const items = [
        { slug: "passport-renewal", status: ServiceStatus.ENABLED },
      ];
      mockService.list.mockResolvedValue(items);

      const result = await controller.list();

      expect(mockService.list).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ status: "success", data: items });
    });
  });

  describe("update (PUT /service_status)", () => {
    it("uses the guard-verified GitHub login as the audit author, not the body", async () => {
      const view = {
        slug: "passport-renewal",
        status: ServiceStatus.DISABLED,
      };
      mockService.setStatus.mockResolvedValue(view);

      const body: UpdateServiceStatusDto = {
        slug: "passport-renewal",
        status: ServiceStatus.DISABLED,
      };

      // Second arg is injected by @GitHubLogin (the verified login).
      const result = await controller.update(body, "octocat");

      expect(mockService.setStatus).toHaveBeenCalledWith(
        "passport-renewal",
        ServiceStatus.DISABLED,
        "octocat",
      );
      expect(result).toMatchObject({ status: "success", data: view });
    });
  });

  describe("audit (GET /service_status/audit)", () => {
    it("calls service.getAuditForSlug with the query slug and returns success", async () => {
      const items = [
        {
          slug: "passport-renewal",
          oldState: ServiceStatus.ENABLED,
          newState: ServiceStatus.DISABLED,
          author: "admin@govtech.bb",
          changedAt: new Date("2026-07-07T12:00:00.000Z"),
        },
      ];
      mockService.getAuditForSlug.mockResolvedValue(items);

      const result = await controller.audit({ slug: "passport-renewal" });

      expect(mockService.getAuditForSlug).toHaveBeenCalledWith(
        "passport-renewal",
      );
      expect(result).toMatchObject({ status: "success", data: items });
    });
  });
});
