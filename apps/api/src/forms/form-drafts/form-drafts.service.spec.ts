import { BadRequestException, NotFoundException } from "@nestjs/common";
import { LessThan } from "typeorm";
import {
  FormDraftEntity,
  DraftStatus,
} from "../../database/entities/form-draft.entity";
import type { FormDefinitionEntity } from "../../database/entities/form-definition.entity";
import { FormDraftRepository } from "./form-draft.repository";
import { FormDefinitionRepository } from "../form-definitions/form-definition.repository";
import { FormDraftsService } from "./form-drafts.service";

function makeDraftRepo(
  overrides: Partial<jest.Mocked<FormDraftRepository>> = {},
): jest.Mocked<FormDraftRepository> {
  return {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<FormDraftRepository>;
}

function makeFormDefRepo(
  overrides: Partial<jest.Mocked<FormDefinitionRepository>> = {},
): jest.Mocked<FormDefinitionRepository> {
  return {
    findOne: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<FormDefinitionRepository>;
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

function makeFormDef(version = "1.0.0"): FormDefinitionEntity {
  return {
    id: "uuid-def-1",
    formId: "passport-renewal",
    version,
    schema: {} as any,
    publishedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  } as FormDefinitionEntity;
}

describe("FormDraftsService", () => {
  describe("create", () => {
    it("pins the form version from the latest form definition", async () => {
      const draftRepo = makeDraftRepo();
      const formDefRepo = makeFormDefRepo();
      const service = new FormDraftsService(draftRepo, formDefRepo);

      draftRepo.findOne.mockResolvedValue(null);
      formDefRepo.findOne.mockResolvedValue(makeFormDef("2.0.0"));
      draftRepo.create.mockReturnValue(makeDraft({ formVersion: "2.0.0" }));
      draftRepo.save.mockResolvedValue(makeDraft({ formVersion: "2.0.0" }));

      const result = await service.create({
        draftId: "my-draft",
        formId: "passport-renewal",
      });

      expect(formDefRepo.findOne).toHaveBeenCalledWith({
        where: { formId: "passport-renewal" },
        order: { createdAt: "DESC" },
      });
      expect(draftRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: "my-draft",
          formId: "passport-renewal",
          formVersion: "2.0.0",
        }),
      );
      expect(result.formVersion).toBe("2.0.0");
    });

    it("pins the specified version when version is provided", async () => {
      const draftRepo = makeDraftRepo();
      const formDefRepo = makeFormDefRepo();
      const service = new FormDraftsService(draftRepo, formDefRepo);

      draftRepo.findOne.mockResolvedValue(null);
      formDefRepo.findOne.mockResolvedValue(makeFormDef("1.0.0"));
      draftRepo.create.mockReturnValue(makeDraft());
      draftRepo.save.mockResolvedValue(makeDraft());

      await service.create({
        draftId: "my-draft",
        formId: "passport-renewal",
        version: "1.0.0",
      });

      expect(formDefRepo.findOne).toHaveBeenCalledWith({
        where: { formId: "passport-renewal", version: "1.0.0" },
        order: { createdAt: "DESC" },
      });
    });

    it("returns the existing draft without creating a duplicate when draftId already exists", async () => {
      const draftRepo = makeDraftRepo();
      const formDefRepo = makeFormDefRepo();
      const service = new FormDraftsService(draftRepo, formDefRepo);

      const existing = makeDraft();
      draftRepo.findOne.mockResolvedValue(existing);

      const result = await service.create({
        draftId: "my-draft",
        formId: "passport-renewal",
      });

      expect(result).toBe(existing);
      expect(formDefRepo.findOne).not.toHaveBeenCalled();
      expect(draftRepo.create).not.toHaveBeenCalled();
      expect(draftRepo.save).not.toHaveBeenCalled();
    });

    it("uses provided values and lastActivePage when supplied at creation", async () => {
      const draftRepo = makeDraftRepo();
      const formDefRepo = makeFormDefRepo();
      const service = new FormDraftsService(draftRepo, formDefRepo);

      const initialValues = { firstName: "John", lastName: "Doe" };
      draftRepo.findOne.mockResolvedValue(null);
      formDefRepo.findOne.mockResolvedValue(makeFormDef("1.0.0"));
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
      const formDefRepo = makeFormDefRepo();
      const service = new FormDraftsService(draftRepo, formDefRepo);

      draftRepo.findOne.mockResolvedValue(null);
      formDefRepo.findOne.mockResolvedValue(makeFormDef("1.0.0"));
      draftRepo.create.mockReturnValue(makeDraft());
      draftRepo.save.mockResolvedValue(makeDraft());

      await service.create({ draftId: "my-draft", formId: "passport-renewal" });

      expect(draftRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ values: {}, lastActivePage: 0 }),
      );
    });

    it("throws NotFoundException when form definition does not exist", async () => {
      const draftRepo = makeDraftRepo();
      const formDefRepo = makeFormDefRepo();
      const service = new FormDraftsService(draftRepo, formDefRepo);

      draftRepo.findOne.mockResolvedValue(null);
      formDefRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ draftId: "my-draft", formId: "unknown-form" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("findById", () => {
    it("returns the draft when found", async () => {
      const draftRepo = makeDraftRepo();
      const service = new FormDraftsService(draftRepo, makeFormDefRepo());

      draftRepo.findOne.mockResolvedValue(makeDraft());

      const result = await service.findById("my-draft");

      expect(draftRepo.findOne).toHaveBeenCalledWith({
        where: { draftId: "my-draft" },
      });
      expect(result.draftId).toBe("my-draft");
    });

    it("throws NotFoundException when draft is not found", async () => {
      const draftRepo = makeDraftRepo();
      const service = new FormDraftsService(draftRepo, makeFormDefRepo());

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
      const service = new FormDraftsService(draftRepo, makeFormDefRepo());

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
      const service = new FormDraftsService(draftRepo, makeFormDefRepo());

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
      const service = new FormDraftsService(draftRepo, makeFormDefRepo());

      await service.update("my-draft", { values: { b: 2 } });

      expect(draft.values).toEqual(originalValues);
    });

    it("throws BadRequestException when draft is abandoned", async () => {
      const draftRepo = makeDraftRepo();
      draftRepo.findOne.mockResolvedValue(
        makeDraft({ status: DraftStatus.ABANDONED }),
      );
      const service = new FormDraftsService(draftRepo, makeFormDefRepo());

      await expect(service.update("my-draft", {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("abandon", () => {
    it("sets draft status to abandoned", async () => {
      const draftRepo = makeDraftRepo();
      const draft = makeDraft();
      draftRepo.findOne.mockResolvedValue(draft);
      draftRepo.save.mockImplementation(async (d) => d as FormDraftEntity);
      const service = new FormDraftsService(draftRepo, makeFormDefRepo());

      await service.abandon("my-draft");

      expect(draftRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: DraftStatus.ABANDONED }),
      );
    });

    it("throws NotFoundException when draft is not found", async () => {
      const draftRepo = makeDraftRepo();
      draftRepo.findOne.mockResolvedValue(null);
      const service = new FormDraftsService(draftRepo, makeFormDefRepo());

      await expect(service.abandon("unknown")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("cleanupExpired", () => {
    it("deletes abandoned drafts older than 7 days", async () => {
      const draftRepo = makeDraftRepo();
      draftRepo.delete.mockResolvedValue({ affected: 2, raw: [] });
      const service = new FormDraftsService(draftRepo, makeFormDefRepo());

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
      const service = new FormDraftsService(draftRepo, makeFormDefRepo());

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
      const service = new FormDraftsService(draftRepo, makeFormDefRepo());

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
      const service = new FormDraftsService(draftRepo, makeFormDefRepo());

      await service.cleanupExpired();

      expect(draftRepo.delete).toHaveBeenCalledTimes(2);
    });
  });
});
