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
      fieldErrors: "first-name::Required || email::Invalid email",
    });
  });

  it("pairs every message with its field, un-aggregated (a field may repeat)", () => {
    const payload = buildValidationErrorPayload("f", "c", "s", [
      { fieldId: "email", errors: ["Required", "Invalid email"] },
    ]);
    // one entry per (field, message), so the same field appears twice
    expect(payload.fieldErrors).toBe("email::Required || email::Invalid email");
  });

  it("strips the delimiters from messages so entries stay parseable", () => {
    const payload = buildValidationErrorPayload("f", "c", "s", [
      { fieldId: "x", errors: ["a || b :: c"] },
    ]);
    expect(payload.fieldErrors).toBe("x::a / b : c");
  });
});
