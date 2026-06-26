import type { Mock } from "vitest";
import { FormDefinitionsController } from "./form-definitions.controller";

const mockService = {
  findAll: vi.fn(),
  findByFormId: vi.fn(),
  findMaintenanceFormIds: vi.fn(),
};

const mockOverridesService = {
  // Default: no override → short-circuit never fires.
  find: vi.fn().mockResolvedValue(null),
  // Default: nothing disabled → getAll filters nothing out.
  findAllFormIds: vi.fn().mockResolvedValue([]),
  disable: vi.fn(),
  enable: vi.fn(),
};

const mockConfigService = {
  get: vi.fn(),
};

describe("FormDefinitionsController", () => {
  let controller: FormDefinitionsController;
  let res: { setHeader: Mock; cookie: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOverridesService.find.mockResolvedValue(null);
    mockOverridesService.findAllFormIds.mockResolvedValue([]);
    // Default: feature disabled (empty token) so existing tests exercise non-preview path.
    mockConfigService.get.mockReturnValue("");
    res = { setHeader: vi.fn(), cookie: vi.fn() };
    controller = new FormDefinitionsController(
      mockService as never,
      mockOverridesService as never,
      mockConfigService as never,
    );
  });

  describe("getAll (GET /form-definitions)", () => {
    it("calls service.findAll and returns success response shape with version", async () => {
      const list = [
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "1.0.0",
        },
      ];
      mockService.findAll.mockResolvedValue(list);

      const result = await controller.getAll();

      expect(mockService.findAll).toHaveBeenCalled();
      expect(result).toMatchObject({ status: "success", data: list });
    });

    it("excludes forms that have been disabled (tombstoned)", async () => {
      mockService.findAll.mockResolvedValue([
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "1.0.0",
        },
        { formId: "retired-form", title: "Retired Form", version: "2.0.0" },
      ]);
      mockOverridesService.findAllFormIds.mockResolvedValue(["retired-form"]);

      const result = await controller.getAll();

      expect(result.data).toEqual([
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "1.0.0",
        },
      ]);
    });

    it("passes each form's category through unchanged", async () => {
      const list = [
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "1.0.0",
          category: "Immigration Department",
        },
      ];
      mockService.findAll.mockResolvedValue(list);

      const result = await controller.getAll();

      expect(result).toMatchObject({ status: "success", data: list });
    });
  });

  describe("getMaintenance (GET /form-definitions/maintenance)", () => {
    it("returns the maintenance form IDs in the success shape", async () => {
      mockService.findMaintenanceFormIds.mockResolvedValue([
        "post-office-redirection-individual",
        "apply-for-conductor-licence",
      ]);

      const result = await controller.getMaintenance();

      expect(mockService.findMaintenanceFormIds).toHaveBeenCalled();
      expect(result).toMatchObject({
        status: "success",
        data: [
          "post-office-redirection-individual",
          "apply-for-conductor-licence",
        ],
      });
    });

    it("returns an empty list when nothing is under maintenance", async () => {
      mockService.findMaintenanceFormIds.mockResolvedValue([]);

      const result = await controller.getMaintenance();

      expect(result.data).toEqual([]);
    });
  });

  describe("get (GET /form-definitions/:formId)", () => {
    it("calls service.findByFormId with no bypass/draft when both headers are absent", async () => {
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
        bypassVisibility: false,
        draft: false,
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

    describe("X-Recipe-Preview token (visibility bypass)", () => {
      it("passes bypassVisibility:true and sets Cache-Control: no-store when token is valid", async () => {
        mockConfigService.get.mockReturnValue("s3cret");
        const contract = {
          formId: "passport-renewal",
          title: "Passport Renewal",
        };
        mockService.findByFormId.mockResolvedValue(contract);

        await controller.get(
          "passport-renewal",
          "s3cret",
          undefined,
          res as never,
        );

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          bypassVisibility: true,
          draft: false,
        });
        expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
      });

      it("passes bypassVisibility:false and does NOT set Cache-Control when token is wrong", async () => {
        mockConfigService.get.mockReturnValue("s3cret");
        const contract = {
          formId: "passport-renewal",
          title: "Passport Renewal",
        };
        mockService.findByFormId.mockResolvedValue(contract);

        await controller.get(
          "passport-renewal",
          "nope",
          undefined,
          res as never,
        );

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          bypassVisibility: false,
          draft: false,
        });
        expect(res.setHeader).not.toHaveBeenCalled();
      });

      it("fails closed when configuredToken is empty even if header matches", async () => {
        // RECIPE_PREVIEW_TOKEN not set → feature disabled, no ""==="" match.
        mockConfigService.get.mockReturnValue("");
        const contract = {
          formId: "passport-renewal",
          title: "Passport Renewal",
        };
        mockService.findByFormId.mockResolvedValue(contract);

        await controller.get("passport-renewal", "", undefined, res as never);

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          bypassVisibility: false,
          draft: false,
        });
        expect(res.setHeader).not.toHaveBeenCalled();
      });
    });

    describe("X-Recipe-Draft token (DB scratch sourcing)", () => {
      it("passes draft:true and sets Cache-Control: no-store when token is valid", async () => {
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
          bypassVisibility: false,
          draft: true,
        });
        expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
      });

      it("passes draft:false and does NOT set Cache-Control when token is wrong", async () => {
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
          bypassVisibility: false,
          draft: false,
        });
        expect(res.setHeader).not.toHaveBeenCalled();
      });
    });

    it("passes both bypassVisibility and draft when both headers are valid", async () => {
      mockConfigService.get.mockReturnValue("s3cret");
      const contract = {
        formId: "passport-renewal",
        title: "Passport Renewal",
      };
      mockService.findByFormId.mockResolvedValue(contract);

      await controller.get(
        "passport-renewal",
        "s3cret",
        "s3cret",
        res as never,
      );

      expect(mockService.findByFormId).toHaveBeenCalledWith({
        formId: "passport-renewal",
        bypassVisibility: true,
        draft: true,
      });
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
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
        controller.get("passport-renewal", "s3cret", undefined, res as never),
      ).rejects.toMatchObject({
        status: 410,
        response: { disabled: true, reason: "Step 3 is broken" },
      });

      // The service must NOT be called — the kill switch fires first.
      expect(mockService.findByFormId).not.toHaveBeenCalled();
      // …and no cookie is minted for a tombstoned form.
      expect(res.cookie).not.toHaveBeenCalled();
    });

    describe("shared preview cookie (#1646 Phase 3)", () => {
      // 4 hours, in milliseconds (express res.cookie maxAge unit). Mirrors
      // landing's 4h grant; both emit Max-Age=14400 in the Set-Cookie header.
      const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

      it("mints the shared cookie scoped to PREVIEW_COOKIE_DOMAIN when X-Recipe-Preview is valid", async () => {
        mockConfigService.get.mockImplementation(
          (key: string) =>
            ({
              RECIPE_PREVIEW_TOKEN: "s3cret",
              PREVIEW_COOKIE_DOMAIN: ".sandbox.alpha.gov.bb",
              NODE_ENV: "production",
            })[key] ?? "",
        );
        mockService.findByFormId.mockResolvedValue({
          formId: "passport-renewal",
        });

        await controller.get(
          "passport-renewal",
          "s3cret",
          undefined,
          res as never,
        );

        expect(res.cookie).toHaveBeenCalledWith("preview", "preview", {
          domain: ".sandbox.alpha.gov.bb",
          httpOnly: true,
          sameSite: "lax",
          secure: true,
          maxAge: FOUR_HOURS_MS,
          path: "/",
        });
      });

      it("omits Domain (host-only) and is insecure outside production when domain is unset", async () => {
        mockConfigService.get.mockImplementation(
          (key: string) =>
            ({ RECIPE_PREVIEW_TOKEN: "s3cret", NODE_ENV: "development" })[
              key
            ] ?? "",
        );
        mockService.findByFormId.mockResolvedValue({
          formId: "passport-renewal",
        });

        await controller.get(
          "passport-renewal",
          "s3cret",
          undefined,
          res as never,
        );

        expect(res.cookie).toHaveBeenCalledWith(
          "preview",
          "preview",
          expect.objectContaining({ domain: undefined, secure: false }),
        );
      });

      it("treats a `preview` cookie (no header) as a visibility bypass and mints no new cookie", async () => {
        // Token unset → the header path is disabled; the cookie alone must still
        // bypass, proving the grant is cookie PRESENCE, not the secret.
        mockConfigService.get.mockReturnValue("");
        mockService.findByFormId.mockResolvedValue({
          formId: "passport-renewal",
        });

        await controller.get(
          "passport-renewal",
          undefined,
          undefined,
          res as never,
          "preview=preview",
        );

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          bypassVisibility: true,
          draft: false,
        });
        expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
        expect(res.cookie).not.toHaveBeenCalled();
      });

      it("treats a `draft`-level cookie as a visibility bypass but NOT DB sourcing", async () => {
        mockConfigService.get.mockReturnValue("");
        mockService.findByFormId.mockResolvedValue({
          formId: "passport-renewal",
        });

        await controller.get(
          "passport-renewal",
          undefined,
          undefined,
          res as never,
          "preview=draft",
        );

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          bypassVisibility: true,
          draft: false,
        });
      });

      it("reads the legacy `1` cookie value as a bypass", async () => {
        mockConfigService.get.mockReturnValue("");
        mockService.findByFormId.mockResolvedValue({
          formId: "passport-renewal",
        });

        await controller.get(
          "passport-renewal",
          undefined,
          undefined,
          res as never,
          "preview=1",
        );

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          bypassVisibility: true,
          draft: false,
        });
      });

      it("parses the `preview` cookie out of a multi-cookie header", async () => {
        mockConfigService.get.mockReturnValue("");
        mockService.findByFormId.mockResolvedValue({
          formId: "passport-renewal",
        });

        await controller.get(
          "passport-renewal",
          undefined,
          undefined,
          res as never,
          "session=abc; preview=preview; theme=dark",
        );

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          bypassVisibility: true,
          draft: false,
        });
      });

      it("does not bypass when no `preview` cookie is present", async () => {
        mockConfigService.get.mockReturnValue("");
        mockService.findByFormId.mockResolvedValue({
          formId: "passport-renewal",
        });

        await controller.get(
          "passport-renewal",
          undefined,
          undefined,
          res as never,
          "session=abc; theme=dark",
        );

        expect(mockService.findByFormId).toHaveBeenCalledWith({
          formId: "passport-renewal",
          bypassVisibility: false,
          draft: false,
        });
        expect(res.setHeader).not.toHaveBeenCalled();
        expect(res.cookie).not.toHaveBeenCalled();
      });

      it("does not mint a cookie on the X-Recipe-Draft path", async () => {
        mockConfigService.get.mockImplementation((key: string) =>
          key === "RECIPE_PREVIEW_TOKEN" ? "s3cret" : "",
        );
        mockService.findByFormId.mockResolvedValue({
          formId: "passport-renewal",
        });

        await controller.get(
          "passport-renewal",
          undefined,
          "s3cret",
          res as never,
        );

        expect(res.cookie).not.toHaveBeenCalled();
      });
    });
  });
});
