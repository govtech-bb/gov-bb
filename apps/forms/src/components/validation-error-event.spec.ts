import { describe, expect, it } from "vitest";
import { buildValidationErrorPayload } from "./validation-error-event";

describe("buildValidationErrorPayload", () => {
  it("aggregates failing fields and error types into one payload", () => {
    const payload = buildValidationErrorPayload(
      "renew-passport",
      "travel-id-citizenship",
      "personal-details",
      [
        { fieldId: "first-name", errors: ["Required"] },
        { fieldId: "dob", errors: [] },
        { fieldId: "email", errors: ["Invalid email"] },
      ],
    );
    expect(payload).toEqual({
      form: "renew-passport",
      category: "travel-id-citizenship",
      step: "personal-details",
      errorCount: 2,
      fields: "first-name,email",
      errorTypes: "Required,Invalid email",
    });
  });
});
