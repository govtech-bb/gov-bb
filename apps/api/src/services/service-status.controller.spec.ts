import { ServiceStatus } from "@/database/entities/service-status.entity";
import { ServiceStatusController } from "./service-status.controller";
import type { UpdateServiceStatusDto } from "./dto";

const mockService = {
  list: vi.fn(),
  setStatus: vi.fn(),
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
        { formId: "passport-renewal", status: ServiceStatus.ENABLED },
      ];
      mockService.list.mockResolvedValue(items);

      const result = await controller.list();

      expect(mockService.list).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ status: "success", data: items });
    });
  });

  describe("update (PUT /service_status)", () => {
    it("calls service.setStatus with the DTO fields and returns success", async () => {
      const view = {
        formId: "passport-renewal",
        status: ServiceStatus.DISABLED,
      };
      mockService.setStatus.mockResolvedValue(view);

      const body: UpdateServiceStatusDto = {
        formId: "passport-renewal",
        status: ServiceStatus.DISABLED,
        author: "admin@govtech.bb",
      };

      const result = await controller.update(body);

      expect(mockService.setStatus).toHaveBeenCalledWith(
        "passport-renewal",
        ServiceStatus.DISABLED,
        "admin@govtech.bb",
      );
      expect(result).toMatchObject({ status: "success", data: view });
    });
  });
});
