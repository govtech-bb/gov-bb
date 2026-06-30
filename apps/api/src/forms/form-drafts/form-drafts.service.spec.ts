import type { Mocked } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { LessThan } from "typeorm";
import {
  FormDraftEntity,
  DraftStatus,
} from "@/database/entities/form-draft.entity";
import { FormDraftRepository } from "./form-draft.repository";
import { FormDefinitionsService } from "../form-definitions/form-definitions.service";
import { FormDraftsService } from "./form-drafts.service";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";

function makeDraftRepo(
  overrides: Partial<Mocked<FormDraftRepository>> = {},
): Mocked<FormDraftRepository> {
  return {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as Mocked<FormDraftRepository>;
}

function makeFormDefinitionsService(
  overrides: Partial<Mocked<FormDefinitionsService>> = {},
): Mocked<FormDefinitionsService> {
  return {
    getRecipe: vi.fn(),
    ...overrides,
  } as unknown as Mocked<FormDefinitionsService>;
}

function makeDraft(overrides: Partial<FormDraftEntity> = {}): FormDraftEntity {
  return {
    id: "uuid-draft-1",
    draftId: "my-draft",
    formId: "passport-renewal",
    formVersion: "1.0.0",
    values: {},
    lastActivePage: 0,
    status: DraftStatus.ACTIVE,
    lastActiveAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  } as FormDraftEntity;
}

function makeRecipe(version = "1.0.0"): ServiceContractRecipe {
  return {
    formId: "passport-renewal",
    title: "Passport Renewal",
    description: "Renew your passport",
    version,
    steps: [],
    processors: [],
  } as unknown as ServiceContractRecipe;
}

describe("FormDraftsService", () => {
  describe("create", () => {
    it("creates a draft with a null formVersion once the form is confirmed published (#1196)", async () => {
      const draftRepo = makeDraftRepo();
      const formDefinitionsService = makeFormDefinitionsService();
      const service = new FormDraftsService(draftRepo, formDefinitionsService);

      draftRepo.findOne.mockResolvedValue(null);
      formDefinitionsService.getRecipe.mockResolvedValue(makeRecipe());
      draftRepo.create.mockReturnValue(makeDraft({ formVersion: null }));
      draftRepo.save.mockResolvedValue(makeDraft({ formVersion: null }));

      const result = await service.create({
        draftId: "my-draft",
        formId: "passport-renewal",
      });

      // Resolution is keyed by formId only — versioning is retired.
      expect(formDefinitionsService.getRecipe).toHaveBeenCalledWith({
        formId: "passport-renewal",
      });
      expect(draftRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: "my-draft",
          formId: "passport-renewal",
          formVersion: null,
        }),
      );
      expect(result.formVersion).toBeNull();
    });

    it("returns the existing draft without creating a duplicate when draftId already exists", async () => {
      const draftRepo = makeDraftRepo();
      const formDefinitionsService = makeFormDefinitionsService();
      const service = new FormDraftsService(draftRepo, formDefinitionsService);

      const existing = makeDraft();
      draftRepo.findOne.mockResolvedValue(existing);

      const result = await service.create({
        draftId: "my-draft",
        formId: "passport-renewal",
      });

      expect(result).toBe(existing);
      expect(formDefinitionsService.getRecipe).not.toHaveBeenCalled();
      expect(draftRepo.create).not.toHaveBeenCalled();
      expect(draftRepo.save).not.toHaveBeenCalled();
    });

    it("uses provided values and lastActivePage when supplied at creation", async () => {
      const draftRepo = makeDraftRepo();
      const formDefinitionsService = makeFormDefinitionsService();
      const service = new FormDraftsService(draftRepo, formDefinitionsService);

      const initialValues = { firstName: "John", lastName: "Doe" };
      draftRepo.findOne.mockResolvedValue(null);
      formDefinitionsService.getRecipe.mockResolvedValue(makeRecipe("1.0.0"));
      draftRepo.create.mockReturnValue(
        makeDraft({ values: initialValues, lastActivePage: 2 }),
      );
      draftRepo.save.mockResolvedValue(
        makeDraft({ values: initialValues, lastActivePage: 2 }),
      );

      const result = await service.create({
        draftId: "my-draft",
        formId: "passport-renewal",
        values: initialValues,
        lastActivePage: 2,
      });

      expect(draftRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ values: initialValues, lastActivePage: 2 }),
      );
      expect(result.values).toEqual(initialValues);
      expect(result.lastActivePage).toBe(2);
    });

    it("defaults values to {} and lastActivePage to 0 when not provided", async () => {
      const draftRepo = makeDraftRepo();
      const formDefinitionsService = makeFormDefinitionsService();
      const service = new FormDraftsService(draftRepo, formDefinitionsService);

      draftRepo.findOne.mockResolvedValue(null);
      formDefinitionsService.getRecipe.mockResolvedValue(makeRecipe("1.0.0"));
      draftRepo.create.mockReturnValue(makeDraft());
      draftRepo.save.mockResolvedValue(makeDraft());

      await service.create({ draftId: "my-draft", formId: "passport-renewal" });

      expect(draftRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ values: {}, lastActivePage: 0 }),
      );
    });

    it("throws NotFoundException when no published recipe is found", async () => {
      // Closes #145: end-user drafts cannot be created against unpublished
      // form_definitions. The lookup goes through FormDefinitionsService —
      // when its recipe-file store has no matching entry, getRecipe returns
      // null and create() throws.
      const draftRepo = makeDraftRepo();
      const formDefinitionsService = makeFormDefinitionsService();
      const service = new FormDraftsService(draftRepo, formDefinitionsService);

      draftRepo.findOne.mockResolvedValue(null);
      formDefinitionsService.getRecipe.mockResolvedValue(null);

      await expect(
        service.create({ draftId: "my-draft", formId: "unknown-form" }),
      ).rejects.toThrow(NotFoundException);
      expect(draftRepo.create).not.toHaveBeenCalled();
      expect(draftRepo.save).not.toHaveBeenCalled();
    });

    it("does not touch the form_definitions repo directly (drafts only succeed when getRecipe returns a recipe)", async () => {
      const draftRepo = makeDraftRepo();
      const formDefinitionsService = makeFormDefinitionsService();
      const service = new FormDraftsService(draftRepo, formDefinitionsService);

      draftRepo.findOne.mockResolvedValue(null);
      formDefinitionsService.getRecipe.mockResolvedValue(makeRecipe("3.0.0"));
      draftRepo.create.mockReturnValue(makeDraft({ formVersion: "3.0.0" }));
      draftRepo.save.mockResolvedValue(makeDraft({ formVersion: "3.0.0" }));

      const result = await service.create({
        draftId: "my-draft",
        formId: "passport-renewal",
      });

      expect(formDefinitionsService.getRecipe).toHaveBeenCalledTimes(1);
      expect(result.formVersion).toBe("3.0.0");
    });
  });

  describe("findById", () => {
    it("returns the draft when found", async () => {
      const draftRepo = makeDraftRepo();
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      draftRepo.findOne.mockResolvedValue(makeDraft());

      const result = await service.findById("my-draft");

      expect(draftRepo.findOne).toHaveBeenCalledWith({
        where: { draftId: "my-draft" },
      });
      expect(result.draftId).toBe("my-draft");
    });

    it("throws NotFoundException when draft is not found", async () => {
      const draftRepo = makeDraftRepo();
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      draftRepo.findOne.mockResolvedValue(null);

      await expect(service.findById("unknown")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("update", () => {
    it("merges new values into existing values without dropping prior fields", async () => {
      const draftRepo = makeDraftRepo();
      const draft = makeDraft({
        values: { firstName: "Jane", surname: "Doe" },
      });
      draftRepo.findOne.mockResolvedValue(draft);
      draftRepo.save.mockImplementation(async (d) => d as FormDraftEntity);
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      await service.update("my-draft", { values: { firstName: "John" } });

      expect(draftRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          values: { firstName: "John", surname: "Doe" },
        }),
      );
    });

    it("updates lastActivePage and refreshes lastActiveAt", async () => {
      const draftRepo = makeDraftRepo();
      const draft = makeDraft();
      draftRepo.findOne.mockResolvedValue(draft);
      draftRepo.save.mockImplementation(async (d) => d as FormDraftEntity);
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      await service.update("my-draft", { lastActivePage: 2 });

      expect(draftRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastActivePage: 2 }),
      );
    });

    it("does not mutate the original draft object", async () => {
      const draftRepo = makeDraftRepo();
      const draft = makeDraft({ values: { a: 1 } });
      const originalValues = { ...draft.values };
      draftRepo.findOne.mockResolvedValue(draft);
      draftRepo.save.mockImplementation(async (d) => d as FormDraftEntity);
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      await service.update("my-draft", { values: { b: 2 } });

      expect(draft.values).toEqual(originalValues);
    });

    it("throws BadRequestException when draft is abandoned", async () => {
      const draftRepo = makeDraftRepo();
      draftRepo.findOne.mockResolvedValue(
        makeDraft({ status: DraftStatus.ABANDONED }),
      );
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      await expect(service.update("my-draft", {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it("preserves original values unchanged when values is undefined", async () => {
      // Branch: `values !== undefined && { values: {...} }` — the false arm
      // When `values` is undefined, no merge occurs; the original draft.values is preserved
      const draftRepo = makeDraftRepo();
      const original = makeDraft({ values: { existing: "data" } });
      draftRepo.findOne.mockResolvedValue(original);
      draftRepo.save.mockImplementation(async (d) => d as FormDraftEntity);
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      await service.update("my-draft", { lastActivePage: 3 });

      // The saved object should retain the original values (no merge)
      expect(draftRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          values: { existing: "data" },
          lastActivePage: 3,
        }),
      );
    });

    it("does not spread lastActivePage when lastActivePage is undefined", async () => {
      // Branch: `lastActivePage !== undefined && { lastActivePage }` — the false arm
      const draftRepo = makeDraftRepo();
      const original = makeDraft({ lastActivePage: 5 });
      draftRepo.findOne.mockResolvedValue(original);
      draftRepo.save.mockImplementation(async (d) => d as FormDraftEntity);
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      await service.update("my-draft", { values: { a: 1 } });

      // The saved object comes from spread — lastActivePage will be from original
      expect(draftRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastActivePage: 5 }),
      );
    });
  });

  describe("abandon", () => {
    it("sets draft status to abandoned", async () => {
      const draftRepo = makeDraftRepo();
      const draft = makeDraft();
      draftRepo.findOne.mockResolvedValue(draft);
      draftRepo.save.mockImplementation(async (d) => d as FormDraftEntity);
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      await service.abandon("my-draft");

      expect(draftRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: DraftStatus.ABANDONED }),
      );
    });

    it("throws NotFoundException when draft is not found", async () => {
      const draftRepo = makeDraftRepo();
      draftRepo.findOne.mockResolvedValue(null);
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      await expect(service.abandon("unknown")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("cleanupExpired", () => {
    it("deletes abandoned drafts older than 7 days", async () => {
      const draftRepo = makeDraftRepo();
      draftRepo.delete.mockResolvedValue({ affected: 2, raw: [] });
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      await service.cleanupExpired();

      const [firstCall] = draftRepo.delete.mock.calls;
      expect(firstCall[0]).toMatchObject({ status: DraftStatus.ABANDONED });
      expect((firstCall[0] as any).updatedAt).toEqual(
        LessThan(expect.any(Date)),
      );
    });

    it("deletes active drafts with lastActiveAt older than 7 days", async () => {
      const draftRepo = makeDraftRepo();
      draftRepo.delete.mockResolvedValue({ affected: 1, raw: [] });
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      await service.cleanupExpired();

      const [, secondCall] = draftRepo.delete.mock.calls;
      expect(secondCall[0]).toMatchObject({ status: DraftStatus.ACTIVE });
      expect((secondCall[0] as any).lastActiveAt).toEqual(
        LessThan(expect.any(Date)),
      );
    });

    it("uses a cutoff date 7 days in the past", async () => {
      const draftRepo = makeDraftRepo();
      draftRepo.delete.mockResolvedValue({ affected: 0, raw: [] });
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      const before = new Date();
      before.setDate(before.getDate() - 7);
      await service.cleanupExpired();
      const after = new Date();
      after.setDate(after.getDate() - 7);

      const cutoff: Date = (draftRepo.delete.mock.calls[0][0] as any).updatedAt
        .value;
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(cutoff.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("calls delete twice even when no drafts are affected", async () => {
      const draftRepo = makeDraftRepo();
      draftRepo.delete.mockResolvedValue({ affected: 0, raw: [] });
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      await service.cleanupExpired();

      expect(draftRepo.delete).toHaveBeenCalledTimes(2);
    });

    it("treats null affected count as 0 (nullish-coalescing branch)", async () => {
      // Branch: `(abandoned.affected ?? 0) + (inactive.affected ?? 0)`
      // when affected is null the ?? 0 fallback should prevent NaN in the total
      const draftRepo = makeDraftRepo();
      draftRepo.delete.mockResolvedValue({ affected: null, raw: [] });
      const service = new FormDraftsService(
        draftRepo,
        makeFormDefinitionsService(),
      );

      // Should not throw — total = 0 + 0 = 0
      await expect(service.cleanupExpired()).resolves.toBeUndefined();
      expect(draftRepo.delete).toHaveBeenCalledTimes(2);
    });
  });
});
