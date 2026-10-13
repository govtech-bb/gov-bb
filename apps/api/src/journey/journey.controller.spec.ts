import type { Mocked } from "vitest";
import { JourneyController } from "./journey.controller";
import type { JourneyService } from "./journey.service";

describe("JourneyController", () => {
  it("passes the body and user agent to the service and returns nothing (204)", () => {
    const service = {
      record: vi.fn().mockReturnValue(1),
    } as unknown as Mocked<JourneyService>;
    const controller = new JourneyController(service);
    const body = { any: "body" };

    expect(controller.record(body, "UA")).toBeUndefined();
    expect(service.record).toHaveBeenCalledWith(body, "UA");
  });

  it("propagates a validation failure (so the request 400s)", () => {
    const service = {
      record: vi.fn().mockImplementation(() => {
        throw new Error("Invalid journey event");
      }),
    } as unknown as Mocked<JourneyService>;
    expect(() => new JourneyController(service).record({}, "UA")).toThrow(
      "Invalid journey event",
    );
  });
});
