import { describe, expect, it } from "vitest";
import { stepCompleteEventName } from "./step-events";

describe("stepCompleteEventName", () => {
  it("builds a slug-qualified per-step name from the 1-based index", () => {
    expect(stepCompleteEventName("renew-passport", 0)).toBe(
      "renew-passport:form-step-one",
    );
    expect(stepCompleteEventName("renew-passport", 2)).toBe(
      "renew-passport:form-step-three",
    );
  });
});
