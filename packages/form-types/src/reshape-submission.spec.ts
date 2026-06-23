import { describe, expect, it } from "vitest";
import {
  assembleStepKeyedValues,
  isSubmittableValue,
  type StepFieldEntry,
} from "./reshape-submission";

describe("isSubmittableValue", () => {
  it("keeps `false` — an unchecked optional checkbox is a real answer", () => {
    expect(isSubmittableValue(false)).toBe(true);
  });

  it("drops undefined and empty strings", () => {
    expect(isSubmittableValue(undefined)).toBe(false);
    expect(isSubmittableValue("")).toBe(false);
  });

  it("drops empty arrays and an incomplete date, keeps populated values", () => {
    expect(isSubmittableValue([])).toBe(false);
    expect(isSubmittableValue({ day: "1", month: "", year: "2024" })).toBe(
      false,
    );
    expect(isSubmittableValue("Alice")).toBe(true);
    expect(isSubmittableValue({ day: "1", month: "1", year: "2024" })).toBe(
      true,
    );
  });
});

describe("assembleStepKeyedValues", () => {
  it("buckets entries under their stepId into the SubmissionValues shape", () => {
    const entries: StepFieldEntry[] = [
      { stepId: "personalInfo", fieldId: "name", value: "Alice" },
      { stepId: "personalInfo", fieldId: "age", value: 30 },
      { stepId: "contact", fieldId: "email", value: "a@b.com" },
    ];

    expect(assembleStepKeyedValues(entries)).toEqual({
      personalInfo: { name: "Alice", age: 30 },
      contact: { email: "a@b.com" },
    });
  });

  it("drops empty values but keeps an explicit `false`", () => {
    const entries: StepFieldEntry[] = [
      { stepId: "s", fieldId: "filled", value: "yes" },
      { stepId: "s", fieldId: "blank", value: "" },
      { stepId: "s", fieldId: "consent", value: false },
    ];

    expect(assembleStepKeyedValues(entries)).toEqual({
      s: { filled: "yes", consent: false },
    });
  });

  it("produces identical output whether entries are resolved forms-style (split keys) or chat-style (contract lookup)", () => {
    // forms resolves (stepId, fieldId) by splitting a `stepId_fieldId` key…
    const formsEntries: StepFieldEntry[] = Object.entries({
      personalInfo_name: "Alice",
      personalInfo_email: "a@b.com",
    }).map(([key, value]) => {
      const [stepId, fieldId] = key.split("_");
      return { stepId, fieldId, value };
    });

    // …chat resolves it by looking each fieldId up in the contract's steps.
    const contract = {
      steps: [{ stepId: "personalInfo", fieldIds: ["name", "email"] }],
    };
    const chatValues: Record<string, unknown> = {
      name: "Alice",
      email: "a@b.com",
    };
    const chatEntries: StepFieldEntry[] = [];
    for (const step of contract.steps) {
      for (const fieldId of step.fieldIds) {
        if (fieldId in chatValues) {
          chatEntries.push({
            stepId: step.stepId,
            fieldId,
            value: chatValues[fieldId],
          });
        }
      }
    }

    expect(assembleStepKeyedValues(formsEntries)).toEqual(
      assembleStepKeyedValues(chatEntries),
    );
  });
});
