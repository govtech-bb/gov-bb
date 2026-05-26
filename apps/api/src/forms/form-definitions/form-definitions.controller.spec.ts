import { FormDefinitionsController } from "./form-definitions.controller";

const mockService = {
  findAll: jest.fn(),
  findByFormId: jest.fn(),
};

const mockOverridesService = {
  // Default: no override → short-circuit never fires.
  find: jest.fn().mockResolvedValue(null),
  disable: jest.fn(),
  enable: jest.fn(),
};

describe("FormDefinitionsController", () => {
  let controller: FormDefinitionsController;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOverridesService.find.mockResolvedValue(null);
    controller = new FormDefinitionsController(
      mockService as never,
      mockOverridesService as never,
    );
  });

  describe("getAll (GET /form-definitions)", () => {
    it("calls service.findAll and returns success response shape", async () => {
      const list = [{ formId: "passport-renewal", title: "Passport Renewal" }];
      mockService.findAll.mockResolvedValue(list);

      const result = await controller.getAll();

      expect(mockService.findAll).toHaveBeenCalled();
      expect(result).toMatchObject({ status: "success", data: list });
    });
  });

  describe("get (GET /form-definitions/:formId)", () => {
    it("calls service.findByFormId with formId only when version is absent", async () => {
      const contract = {
        formId: "passport-renewal",
        title: "Passport Renewal",
      };
      mockService.findByFormId.mockResolvedValue(contract);

      const result = await controller.get("passport-renewal");

      expect(mockService.findByFormId).toHaveBeenCalledWith({
        formId: "passport-renewal",
        version: undefined,
      });
      expect(result).toMatchObject({ status: "success", data: contract });
    });

    it("calls service.findByFormId with version when provided", async () => {
      const contract = {
        formId: "passport-renewal",
        title: "Passport Renewal",
      };
      mockService.findByFormId.mockResolvedValue(contract);

      const result = await controller.get("passport-renewal", "2.0.0");

      expect(mockService.findByFormId).toHaveBeenCalledWith({
        formId: "passport-renewal",
        version: "2.0.0",
      });
      expect(result).toMatchObject({ status: "success", data: contract });
    });

    it("propagates errors from service.findByFormId", async () => {
      mockService.findByFormId.mockRejectedValue(new Error("Not found"));

      await expect(controller.get("missing-form")).rejects.toThrow("Not found");
    });
  });
});
