import { describe, expect, it } from "vitest";
import { buildValidationErrorPayload } from "./validation-error-event";

describe("buildValidationErrorPayload", () => {
  it("encodes each failing field with its reason codes", () => {
    const payload = buildValidationErrorPayload(
      "renew-passport",
      "travel-id-citizenship",
      "personal-details",
      [
        { fieldId: "first-name", codes: ["required"] },
        { fieldId: "dob", codes: [] },
        { fieldId: "email", codes: ["required", "email"] },
      ],
    );
    expect(payload).toEqual({
      form: "renew-passport",
      category: "travel-id-citizenship",
      step: "personal-details",
      errorCount: 2,
      fieldErrors: "first-name:required;email:required|email",
    });
  });

  it("produces an empty string when nothing failed", () => {
    const payload = buildValidationErrorPayload("f", "c", "step-1", [
      { fieldId: "a", codes: [] },
    ]);
    expect(payload.errorCount).toBe(0);
    expect(payload.fieldErrors).toBe("");
  });
});
