import type { Mock } from "vitest";
import { HttpStatus } from "@nestjs/common";
import { FormDefinitionsController } from "./form-definitions.controller";

const mockFormDefinitionsService = {
  findAll: vi.fn(),
  findByFormId: vi.fn(),
};

const mockDisabledOverridesService = {
  find: vi.fn(),
  findAllFormIds: vi.fn().mockResolvedValue([]),
  disable: vi.fn(),
  enable: vi.fn(),
};

const mockConfigService = {
  get: vi.fn().mockReturnValue(""),
};

describe("FormDefinitionsController — kill switch short-circuit", () => {
  let controller: FormDefinitionsController;
  let res: { setHeader: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigService.get.mockReturnValue("");
    res = { setHeader: vi.fn() };
    controller = new FormDefinitionsController(
      mockFormDefinitionsService as never,
      mockDisabledOverridesService as never,
      mockConfigService as never,
    );
  });

  it("serves the form normally when no override exists", async () => {
    mockDisabledOverridesService.find.mockResolvedValue(null);
    const contract = { formId: "passport-renewal", title: "Passport Renewal" };
    mockFormDefinitionsService.findByFormId.mockResolvedValue(contract);

    const result = await controller.get(
      "passport-renewal",
      undefined,
      res as never,
    );

    expect(mockDisabledOverridesService.find).toHaveBeenCalledWith(
      "passport-renewal",
    );
    expect(mockFormDefinitionsService.findByFormId).toHaveBeenCalledWith({
      formId: "passport-renewal",
      preview: false,
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

    await expect(
      controller.get("passport-renewal", undefined, res as never),
    ).rejects.toMatchObject({
      status: HttpStatus.GONE,
      response: { disabled: true, reason: "Step 3 is broken" },
    });

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
