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

const mockConfigService = {
  get: jest.fn(),
};

describe("FormDefinitionsController", () => {
  let controller: FormDefinitionsController;
  let res: { setHeader: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockOverridesService.find.mockResolvedValue(null);
    // Default: feature disabled (empty token) so existing tests exercise non-preview path.
    mockConfigService.get.mockReturnValue("");
    res = { setHeader: jest.fn() };
    controller = new FormDefinitionsController(
      mockService as never,
      mockOverridesService as never,
      mockConfigService as never,
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

      const result = await controller.get(
        "passport-renewal",
        undefined,
        undefined,
        res as never,
      );

      expect(mockService.findByFormId).toHaveBeenCalledWith({
        formId: "passport-renewal",
        version: undefined,
        preview: false,
      });
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: "success", data: contract });
    });

    it("calls service.findByFormId with version when provided", async () => {
      const contract = {
        formId: "passport-renewal",
        title: "Passport Renewal",
      };
      mockService.findByFormId.mockResolvedValue(contract);

      const result = await controller.get(
        "passport-renewal",
        "2.0.0",
        undefined,
        res as never,
      );

      expect(mockService.findByFormId).toHaveBeenCalledWith({
        formId: "passport-renewal",
        version: "2.0.0",
        preview: false,
      });
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: "success", data: contract });
    });

    it("propagates errors from service.findByFormId", async () => {
      mockService.findByFormId.mockRejectedValue(new Error("Not found"));

      await expect(
        controller.get("missing-form", undefined, undefined, res as never),
      ).rejects.toThrow("Not found");
    });

    describe("preview token behaviour", () => {
      it("passes preview:true and sets Cache-Control: no-store when token is valid", async () => {
        mockConfigService.get.mockReturnValue("s3cret");
        const contract = {
          formId: "passport-renewal",
          title: "Passport Renewal",
        };
        mockService.findByFormId.mockResolvedValue(contract);

        await controller.get(
          "passport-renewal",
          undefined,
          "s3cret",
          res as never,
        );

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          version: undefined,
          preview: true,
        });
        expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
      });

      it("passes preview:false and does NOT set Cache-Control when token is wrong", async () => {
        mockConfigService.get.mockReturnValue("s3cret");
        const contract = {
          formId: "passport-renewal",
          title: "Passport Renewal",
        };
        mockService.findByFormId.mockResolvedValue(contract);

        await controller.get(
          "passport-renewal",
          undefined,
          "nope",
          res as never,
        );

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          version: undefined,
          preview: false,
        });
        expect(res.setHeader).not.toHaveBeenCalled();
      });

      it("passes preview:false and does NOT set Cache-Control when header is absent", async () => {
        mockConfigService.get.mockReturnValue("s3cret");
        const contract = {
          formId: "passport-renewal",
          title: "Passport Renewal",
        };
        mockService.findByFormId.mockResolvedValue(contract);

        await controller.get(
          "passport-renewal",
          undefined,
          undefined,
          res as never,
        );

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          version: undefined,
          preview: false,
        });
        expect(res.setHeader).not.toHaveBeenCalled();
      });

      it("fails closed (preview:false) when configuredToken is empty even if header matches", async () => {
        // RECIPE_PREVIEW_TOKEN not set → feature disabled, no ""==="" match.
        mockConfigService.get.mockReturnValue("");
        const contract = {
          formId: "passport-renewal",
          title: "Passport Renewal",
        };
        mockService.findByFormId.mockResolvedValue(contract);

        await controller.get("passport-renewal", undefined, "", res as never);

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          version: undefined,
          preview: false,
        });
        expect(res.setHeader).not.toHaveBeenCalled();
      });

      it("fails closed (preview:false) when configuredToken is empty and header has value", async () => {
        mockConfigService.get.mockReturnValue("");
        const contract = {
          formId: "passport-renewal",
          title: "Passport Renewal",
        };
        mockService.findByFormId.mockResolvedValue(contract);

        await controller.get(
          "passport-renewal",
          undefined,
          "anything",
          res as never,
        );

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          version: undefined,
          preview: false,
        });
        expect(res.setHeader).not.toHaveBeenCalled();
      });

      it("throws 410 GONE for a disabled form even when a valid preview token is supplied", async () => {
        mockConfigService.get.mockReturnValue("s3cret");
        mockOverridesService.find.mockResolvedValue({
          formId: "passport-renewal",
          reason: "Step 3 is broken",
          disabledBy: "alice@govtech.bb",
          disabledAt: new Date("2026-05-22T09:00:00.000Z"),
        });

        await expect(
          controller.get("passport-renewal", undefined, "s3cret", res as never),
        ).rejects.toMatchObject({
          status: 410,
          response: { disabled: true, reason: "Step 3 is broken" },
        });

        // The service must NOT be called — the kill switch fires first.
        expect(mockService.findByFormId).not.toHaveBeenCalled();
      });
    });
  });
});
