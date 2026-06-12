import type { Mocked } from "vitest";
import { FeedbackController } from "./feedback.controller";
import type { FeedbackService } from "./feedback.service";
import type { CreateFeedbackDto } from "./dto/create-feedback.dto";

function makeService(): Mocked<FeedbackService> {
  return {
    send: vi.fn().mockResolvedValue(undefined),
  } as unknown as Mocked<FeedbackService>;
}

const BODY = {
  visitReason: "Renew my passport",
  whatWentWrong: "",
  referrer: "/feedback",
  present: true,
} as CreateFeedbackDto;

describe("FeedbackController", () => {
  it("forwards the submission to the service and returns a success envelope", async () => {
    const service = makeService();
    const controller = new FeedbackController(service);

    const result = await controller.create(BODY);

    expect(service.send).toHaveBeenCalledWith(BODY);
    expect(result).toMatchObject({
      status: "success",
      data: null,
      message: "Feedback sent",
    });
  });

  it("propagates a service failure (so the request 500s, not a false success)", async () => {
    const service = makeService();
    service.send.mockRejectedValueOnce(new Error("send failed"));
    const controller = new FeedbackController(service);

    await expect(controller.create(BODY)).rejects.toThrow("send failed");
  });
});
