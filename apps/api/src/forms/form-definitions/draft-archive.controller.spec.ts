import { NotFoundException } from "@nestjs/common";
import { DraftArchiveController } from "./draft-archive.controller";

const mockService = {
  archive: vi.fn(),
};

describe("DraftArchiveController", () => {
  let controller: DraftArchiveController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new DraftArchiveController(mockService as never);
  });

  it("calls service.archive with the formId path param and returns void (HTTP 204)", async () => {
    mockService.archive.mockResolvedValue(undefined);

    const result = await controller.archive("passport-renewal");

    expect(mockService.archive).toHaveBeenCalledWith({
      formId: "passport-renewal",
    });
    expect(result).toBeUndefined();
  });

  it("propagates NotFoundException from the service (HTTP 404)", async () => {
    mockService.archive.mockRejectedValue(
      new NotFoundException("Draft form definition not found"),
    );

    await expect(controller.archive("ghost")).rejects.toThrow(
      NotFoundException,
    );
  });
});
