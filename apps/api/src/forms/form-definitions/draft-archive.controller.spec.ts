import { NotFoundException } from "@nestjs/common";
import { DraftArchiveController } from "./draft-archive.controller";

const mockService = {
  archive: jest.fn(),
};

describe("DraftArchiveController", () => {
  let controller: DraftArchiveController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DraftArchiveController(mockService as never);
  });

  it("calls service.archive with the path params and returns void (HTTP 204)", async () => {
    mockService.archive.mockResolvedValue(undefined);

    const result = await controller.archive("passport-renewal", "1.2.0");

    expect(mockService.archive).toHaveBeenCalledWith({
      formId: "passport-renewal",
      version: "1.2.0",
    });
    expect(result).toBeUndefined();
  });

  it("propagates NotFoundException from the service (HTTP 404)", async () => {
    mockService.archive.mockRejectedValue(
      new NotFoundException("Draft form definition not found"),
    );

    await expect(controller.archive("ghost", "9.9.9")).rejects.toThrow(
      NotFoundException,
    );
  });
});
