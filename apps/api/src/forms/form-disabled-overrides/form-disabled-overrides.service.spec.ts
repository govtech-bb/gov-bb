import type { FormDisabledOverrideEntity } from "../../database/entities/form-disabled-override.entity";
import { FormDisabledOverrideRepository } from "./form-disabled-override.repository";
import { FormDisabledOverridesService } from "./form-disabled-overrides.service";

function makeOverride(
  overrides: Partial<FormDisabledOverrideEntity> = {},
): FormDisabledOverrideEntity {
  return {
    formId: "passport-renewal",
    reason: "Step 3 is broken",
    disabledBy: "alice@govtech.bb",
    disabledAt: new Date("2026-05-22T09:00:00.000Z"),
    ...overrides,
  } as FormDisabledOverrideEntity;
}

function makeMocks() {
  const repo = {
    findOne: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<FormDisabledOverrideRepository>;

  const service = new FormDisabledOverridesService(repo);
  return { repo, service };
}

describe("FormDisabledOverridesService", () => {
  describe("find", () => {
    it("returns the row when one exists", async () => {
      const { repo, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(makeOverride());

      const result = await service.find("passport-renewal");

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { formId: "passport-renewal" },
      });
      expect(result).toEqual(makeOverride());
    });

    it("returns null when no row exists", async () => {
      const { repo, service } = makeMocks();
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.find("ghost");

      expect(result).toBeNull();
    });
  });

  describe("disable", () => {
    it("upserts a new override row", async () => {
      const { repo, service } = makeMocks();
      (repo.upsert as jest.Mock).mockResolvedValue({ identifiers: [{}] });

      await service.disable(
        "passport-renewal",
        "Step 3 is broken",
        "alice@govtech.bb",
      );

      expect(repo.upsert).toHaveBeenCalledWith(
        {
          formId: "passport-renewal",
          reason: "Step 3 is broken",
          disabledBy: "alice@govtech.bb",
        },
        ["formId"],
      );
    });

    it("re-disabling overwrites reason and disabledBy", async () => {
      const { repo, service } = makeMocks();
      (repo.upsert as jest.Mock).mockResolvedValue({ identifiers: [{}] });

      await service.disable("passport-renewal", "new reason", "bob@govtech.bb");

      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "new reason",
          disabledBy: "bob@govtech.bb",
        }),
        ["formId"],
      );
    });
  });

  describe("enable", () => {
    it("deletes the override row", async () => {
      const { repo, service } = makeMocks();
      (repo.delete as jest.Mock).mockResolvedValue({ affected: 1 });

      await service.enable("passport-renewal");

      expect(repo.delete).toHaveBeenCalledWith({ formId: "passport-renewal" });
    });

    it("is idempotent when no row exists", async () => {
      const { repo, service } = makeMocks();
      (repo.delete as jest.Mock).mockResolvedValue({ affected: 0 });

      await expect(service.enable("ghost")).resolves.toBeUndefined();
      expect(repo.delete).toHaveBeenCalledWith({ formId: "ghost" });
    });
  });
});
