import { NotFoundException } from "@nestjs/common";
import { FormDraftsController } from "./form-drafts.controller";
import { CreateFormDraftDto, UpdateFormDraftDto } from "./dto";
import type { FormDraftEntity } from "@/database/entities/form-draft.entity";

const mockDraft = (overrides: Partial<FormDraftEntity> = {}): FormDraftEntity =>
  ({
    draftId: "draft-001",
    formId: "passport-renewal",
    formVersion: "1.0.0",
    lastActivePage: 0,
    values: {},
    status: "active",
    ...overrides,
  }) as unknown as FormDraftEntity;

const mockService = {
  create: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  abandon: vi.fn(),
};

describe("FormDraftsController", () => {
  let controller: FormDraftsController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new FormDraftsController(mockService as never);
  });

  describe("create (POST /form-drafts)", () => {
    it("calls service.create and returns success response shape", async () => {
      const draft = mockDraft();
      mockService.create.mockResolvedValue(draft);

      const body: CreateFormDraftDto = {
        draftId: "draft-001",
        formId: "passport-renewal",
      };

      const result = await controller.create(body);

      expect(mockService.create).toHaveBeenCalledWith(body);
      expect(result).toMatchObject({
        status: "success",
        data: draft,
      });
    });
  });

  describe("getById (GET /form-drafts/:draftId)", () => {
    it("calls service.findById and returns success response shape", async () => {
      const draft = mockDraft();
      mockService.findById.mockResolvedValue(draft);

      const result = await controller.getById("draft-001");

      expect(mockService.findById).toHaveBeenCalledWith("draft-001");
      expect(result).toMatchObject({
        status: "success",
        data: draft,
      });
    });

    it("propagates NotFoundException when draft does not exist", async () => {
      mockService.findById.mockRejectedValue(
        new NotFoundException("Draft not found"),
      );

      await expect(controller.getById("missing")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("update (PATCH /form-drafts/:draftId)", () => {
    it("calls service.update with draftId and body, returns success response", async () => {
      const draft = mockDraft({ lastActivePage: 1 });
      mockService.update.mockResolvedValue(draft);

      const body: UpdateFormDraftDto = { lastActivePage: 1 };
      const result = await controller.update("draft-001", body);

      expect(mockService.update).toHaveBeenCalledWith("draft-001", body);
      expect(result).toMatchObject({
        status: "success",
        data: draft,
      });
    });
  });

  describe("abandon (DELETE /form-drafts/:draftId)", () => {
    it("calls service.abandon and returns void", async () => {
      mockService.abandon.mockResolvedValue(undefined);

      const result = await controller.abandon("draft-001");

      expect(mockService.abandon).toHaveBeenCalledWith("draft-001");
      expect(result).toBeUndefined();
    });
  });
});
