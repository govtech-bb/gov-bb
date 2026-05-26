import { HttpException, HttpStatus } from "@nestjs/common";
import { FormDefinitionsController } from "./form-definitions.controller";

const mockFormDefinitionsService = {
  findAll: jest.fn(),
  findByFormId: jest.fn(),
};

const mockDisabledOverridesService = {
  find: jest.fn(),
  disable: jest.fn(),
  enable: jest.fn(),
};

describe("FormDefinitionsController — kill switch short-circuit", () => {
  let controller: FormDefinitionsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FormDefinitionsController(
      mockFormDefinitionsService as never,
      mockDisabledOverridesService as never,
    );
  });

  it("serves the form normally when no override exists", async () => {
    mockDisabledOverridesService.find.mockResolvedValue(null);
    const contract = { formId: "passport-renewal", title: "Passport Renewal" };
    mockFormDefinitionsService.findByFormId.mockResolvedValue(contract);

    const result = await controller.get("passport-renewal");

    expect(mockDisabledOverridesService.find).toHaveBeenCalledWith(
      "passport-renewal",
    );
    expect(mockFormDefinitionsService.findByFormId).toHaveBeenCalledWith({
      formId: "passport-renewal",
      version: undefined,
    });
    expect(result).toMatchObject({ status: "success", data: contract });
  });

  it("throws 410 Gone with { disabled: true, reason } when an override exists", async () => {
    mockDisabledOverridesService.find.mockResolvedValue({
      formId: "passport-renewal",
      reason: "Step 3 is broken",
      disabledBy: "alice@govtech.bb",
      disabledAt: new Date("2026-05-22T09:00:00.000Z"),
    });

    await expect(controller.get("passport-renewal")).rejects.toMatchObject({
      status: HttpStatus.GONE,
      response: { disabled: true, reason: "Step 3 is broken" },
    });

    expect(mockFormDefinitionsService.findByFormId).not.toHaveBeenCalled();
  });

  it("short-circuits regardless of version query parameter", async () => {
    mockDisabledOverridesService.find.mockResolvedValue({
      formId: "passport-renewal",
      reason: "All versions disabled",
      disabledBy: "alice@govtech.bb",
      disabledAt: new Date("2026-05-22T09:00:00.000Z"),
    });

    await expect(
      controller.get("passport-renewal", "1.0.0"),
    ).rejects.toBeInstanceOf(HttpException);

    expect(mockFormDefinitionsService.findByFormId).not.toHaveBeenCalled();
  });

  it("does NOT short-circuit findAll", async () => {
    mockFormDefinitionsService.findAll.mockResolvedValue([
      { formId: "passport-renewal", title: "Passport Renewal" },
    ]);

    const result = await controller.getAll();

    expect(mockDisabledOverridesService.find).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "success" });
  });
});
