import type { ServiceContract, SubmissionValues } from "@govtech-bb/form-types";
import { deriveHigherRiskSelection } from "./derive-higher-risk";

const contractWithAccordion = {
  steps: [
    {
      stepId: "food",
      elements: [
        {
          fieldId: "food-served",
          htmlType: "checkbox-accordion",
          groups: [
            {
              label: "Meat",
              higherRisk: true,
              options: [
                { value: "chicken", label: "Chicken" },
                { value: "beef", label: "Beef" },
              ],
            },
            {
              label: "Snacks",
              options: [{ value: "popcorn", label: "Popcorn" }],
            },
          ],
        },
      ],
    },
  ],
} as unknown as ServiceContract;

const vals = (selected: string[]): SubmissionValues => ({
  food: { "food-served": selected },
});

describe("deriveHigherRiskSelection", () => {
  it("returns true when a higher-risk item is selected", () => {
    expect(
      deriveHigherRiskSelection(contractWithAccordion, vals(["chicken"])),
    ).toBe(true);
  });

  it("returns false when only lower-risk items are selected", () => {
    expect(
      deriveHigherRiskSelection(contractWithAccordion, vals(["popcorn"])),
    ).toBe(false);
  });

  it("returns false when nothing is selected", () => {
    expect(deriveHigherRiskSelection(contractWithAccordion, vals([]))).toBe(
      false,
    );
  });

  it("returns null when the form has no checkbox-accordion field", () => {
    const contract = {
      steps: [
        {
          stepId: "food",
          elements: [{ fieldId: "notes", htmlType: "text", groups: undefined }],
        },
      ],
    } as unknown as ServiceContract;
    expect(deriveHigherRiskSelection(contract, vals(["chicken"]))).toBeNull();
  });
});
