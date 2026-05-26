import { FormDisabledOverridesAdminController } from "./form-disabled-overrides.admin.controller";

const mockService = {
  find: jest.fn(),
  disable: jest.fn(),
  enable: jest.fn(),
};

describe("FormDisabledOverridesAdminController", () => {
  let controller: FormDisabledOverridesAdminController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FormDisabledOverridesAdminController(mockService as never);
  });

  describe("disable (POST /admin/form-definitions/:formId/disable)", () => {
    it("calls service.disable with formId, reason, and disabledBy", async () => {
      mockService.disable.mockResolvedValue(undefined);

      const result = await controller.disable("passport-renewal", {
        reason: "Step 3 is broken",
        disabledBy: "alice@govtech.bb",
      });

      expect(mockService.disable).toHaveBeenCalledWith(
        "passport-renewal",
        "Step 3 is broken",
        "alice@govtech.bb",
      );
      expect(result).toMatchObject({
        status: "success",
        data: { disabled: true, formId: "passport-renewal" },
      });
    });
  });

  describe("enable (DELETE /admin/form-definitions/:formId/disable)", () => {
    it("calls service.enable", async () => {
      mockService.enable.mockResolvedValue(undefined);

      const result = await controller.enable("passport-renewal");

      expect(mockService.enable).toHaveBeenCalledWith("passport-renewal");
      expect(result).toMatchObject({
        status: "success",
        data: { disabled: false, formId: "passport-renewal" },
      });
    });
  });

  describe("status (GET /admin/form-definitions/:formId/disable)", () => {
    it("returns disabled=true with reason and metadata when a row exists", async () => {
      const row = {
        formId: "passport-renewal",
        reason: "Step 3 is broken",
        disabledBy: "alice@govtech.bb",
        disabledAt: new Date("2026-05-22T09:00:00.000Z"),
      };
      mockService.find.mockResolvedValue(row);

      const result = await controller.status("passport-renewal");

      expect(mockService.find).toHaveBeenCalledWith("passport-renewal");
      expect(result).toMatchObject({
        status: "success",
        data: {
          disabled: true,
          formId: "passport-renewal",
          reason: "Step 3 is broken",
          disabledBy: "alice@govtech.bb",
          disabledAt: row.disabledAt,
        },
      });
    });

    it("returns disabled=false when no row exists", async () => {
      mockService.find.mockResolvedValue(null);

      const result = await controller.status("passport-renewal");

      expect(result).toMatchObject({
        status: "success",
        data: { disabled: false, formId: "passport-renewal" },
      });
    });
  });
});
